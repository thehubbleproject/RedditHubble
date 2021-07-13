import { arrayify } from "@ethersproject/bytes";
import { assert } from "chai";
import { providers } from "ethers";
import { ethers } from "hardhat";
import { CoreAPI } from "../../ts/client/coreAPI";
import { SimulatorPool } from "../../ts/client/features/transfer";
import { Packer } from "../../ts/client/services/packer";
import { SyncerService } from "../../ts/client/services/syncer";
import { PRODUCTION_PARAMS } from "../../ts/constants";
import { CommonToken } from "../../ts/decimal";
import { deployAll } from "../../ts/deploy";
import { deployKeyless } from "../../ts/deployment/deploy";
import { Group, storageManagerFactory } from "../../ts/factory";
import { Genesis } from "../../ts/genesis";
import * as mcl from "../../ts/mcl";
import del from "del";
import { CustomToken__factory } from "../../types/ethers-contracts";

/**
 * This integration test ensures that
 * 1. A node in packing/proposal mode syncs from L1 and then packs deposits and transfers.
 * 2. A node in syncing mode successfully updates to match the first node's state from L1 events.
 *
 * When a watching/contesting node is implemented,
 * this might be worth moving over to more of a
 * E2E (end-to-end) style test in which all 3 node
 * types run independantly on an initial data set
 * and reach a correct end state.
 */
describe("Client Integration", function() {
    before(async () => {
        await del("./leveldb/*");
    });

    after(async () => {
        await del("./leveldb/*");
    });

    it("run", async function() {
        await mcl.init();
        const [signer] = await ethers.getSigners();
        const provider = signer.provider as providers.JsonRpcProvider;
        const [genesisEth1Block, network] = await Promise.all([
            provider.getBlockNumber(),
            provider.getNetwork()
        ]);

        await deployKeyless(signer, false);

        const storageSyncer = await storageManagerFactory();
        const storagePacker = await storageManagerFactory();

        // Ensure initial states match
        assert.equal(storageSyncer.state.root, storagePacker.state.root);
        assert.equal(storageSyncer.pubkey.root, storagePacker.pubkey.root);

        // Deploy contracts
        const parameters = PRODUCTION_PARAMS;
        parameters.USE_BURN_AUCTION = false;
        parameters.GENESIS_STATE_ROOT = storagePacker.state.root;

        const contracts = await deployAll(signer, parameters);

        // Setup and register custom tokens
        const customTokens = await Promise.all([
            new CustomToken__factory(signer).deploy("Hubble", "HUB"),
            new CustomToken__factory(signer).deploy("Telescope", "TLSC")
        ]);
        for (const token of customTokens) {
            await contracts.tokenRegistry.requestRegistration(token.address);
            await contracts.tokenRegistry.finaliseRegistration(token.address);
        }
        const allTokens = [contracts.exampleToken, ...customTokens];

        // Setup users/accounts
        const numUsers = 32;
        const initialBalance = CommonToken.fromHumanValue("100.12");
        const group = Group.new({ n: numUsers });

        const domainSeparator = await contracts.rollup.domainSeparator();
        group.setupSigners(arrayify(domainSeparator));

        let numDeposits = 0;
        let currentStateID = 0;
        // Split users in subtree sized chunks
        const subtreeSize = 2 ** parameters.MAX_DEPOSIT_SUBTREE_DEPTH;
        for (const subGroup of group.groupInterator(subtreeSize)) {
            // Setup L1 for syncer & packer
            for (const user of subGroup.userIterator()) {
                // Clear out default stateIDs
                user.clearStateIDs();
                // Pubkey
                await contracts.blsAccountRegistry.register(user.pubkey);
                // Deposit tokens
                for (let tokenID = 0; tokenID < allTokens.length; tokenID++) {
                    const token = allTokens[tokenID];
                    // Approve token transfer
                    await token.approve(
                        contracts.depositManager.address,
                        initialBalance.l1Value
                    );
                    // Queue deposit
                    await contracts.depositManager.depositFor(
                        user.pubkeyID,
                        initialBalance.l1Value,
                        tokenID
                    );
                    user.addStateID(tokenID, currentStateID++);
                    numDeposits++;
                }
            }
        }

        // Setup a pool which simulates random token transfers
        // Use first user as fee receiver
        const firstUser = group.getUser(0);
        const numTransferBatches = 10;
        const maxTransfers =
            numTransferBatches * parameters.MAX_TXS_PER_COMMIT ** 2;
        const simPool = new SimulatorPool({
            group,
            storage: storagePacker,
            feeReceivers: allTokens.map((_token, tokenID) => ({
                tokenID,
                stateID: firstUser.getStateID(tokenID)
            })),
            maxTransfers
        });

        const genesis = await Genesis.fromContracts(
            contracts,
            parameters,
            genesisEth1Block,
            network.chainId
        );
        const apiSyncer = CoreAPI.new(storageSyncer, genesis, provider, signer);
        const apiPacker = CoreAPI.new(storagePacker, genesis, provider, signer);

        // Simulate packing node running
        const packerSyncer = new SyncerService(apiPacker);
        const packer = new Packer(apiPacker, simPool);
        await packerSyncer.initialSync();
        await packer.runOnce();

        // Simulate syncing node running
        const syncer = new SyncerService(apiSyncer);
        await syncer.initialSync();

        // Confirm final states match
        assert.equal(storageSyncer.state.root, storagePacker.state.root);
        assert.equal(storageSyncer.pubkey.root, storagePacker.pubkey.root);

        // Confirm storage has correct counts
        const numGenesisBatches = 1;
        const numDepositBatches = numDeposits / subtreeSize;
        const numBatches =
            numGenesisBatches + numDepositBatches + numTransferBatches;
        assert.equal(storageSyncer.batches.count(), numBatches);
        assert.equal(storagePacker.batches.count(), numBatches);

        assert.equal(storageSyncer.transactions.count(), maxTransfers);
        assert.equal(storagePacker.transactions.count(), maxTransfers);
    }).timeout(360000);
});
