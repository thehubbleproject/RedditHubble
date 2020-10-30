import { ethers } from "@nomiclabs/buidler";
import { AccountRegistry } from "../ts/accountTree";
import { txMassMigrationFactory, UserStateFactory } from "../ts/factory";
import { State } from "../ts/state";
import { StateTree } from "../ts/stateTree";
import { randHex, sum } from "../ts/utils";
import {
    LoggerFactory,
    BlsAccountRegistryFactory,
    TestMassMigrationFactory
} from "../types/ethers-contracts";
import * as mcl from "../ts/mcl";
import { TestMassMigration } from "../types/ethers-contracts/TestMassMigration";
import { serialize } from "../ts/tx";
import { assert } from "chai";
import { Result } from "../ts/interfaces";
import { constants } from "ethers";
import { Tree } from "../ts/tree";

const DOMAIN_HEX = randHex(32);
const STATE_SIZE = 32;
const COMMIT_SIZE = 32;
const STATE_TREE_DEPTH = 32;
const spokeID = 1;

describe("Rollup Mass Migration", () => {
    let rollup: TestMassMigration;
    let registry: AccountRegistry;
    let stateTree: StateTree;
    let states: State[] = [];

    before(async function() {
        await mcl.init();
        mcl.setDomainHex(DOMAIN_HEX);
        const [signer] = await ethers.getSigners();
        const logger = await new LoggerFactory(signer).deploy();
        const registryContract = await new BlsAccountRegistryFactory(
            signer
        ).deploy(logger.address);

        registry = await AccountRegistry.new(registryContract);
        states = UserStateFactory.buildList(STATE_SIZE);
        for (const state of states) {
            await registry.register(state.getPubkey());
        }
    });
    beforeEach(async function() {
        const [signer] = await ethers.getSigners();
        rollup = await new TestMassMigrationFactory(signer).deploy();
        stateTree = StateTree.new(STATE_TREE_DEPTH);
        stateTree.createStateBulk(states);
    });

    it("checks signature", async function() {
        const txs = txMassMigrationFactory(states, COMMIT_SIZE, spokeID);
        const signatures = [];
        const pubkeys = [];
        const pubkeyWitnesses = [];

        for (const tx of txs) {
            const sender = states[tx.fromIndex];
            pubkeys.push(sender.getPubkey());
            pubkeyWitnesses.push(registry.witness(sender.pubkeyIndex));
            signatures.push(sender.sign(tx));
        }
        const signature = mcl.aggreagate(signatures);
        const { safe } = stateTree.processMassMigrationCommit(txs, 0);
        assert.isTrue(safe);
        const serialized = serialize(txs);

        // Need post stateWitnesses
        const postStates = txs.map(tx => stateTree.getState(tx.fromIndex));
        const stateWitnesses = txs.map(tx =>
            stateTree.getStateWitness(tx.fromIndex)
        );

        const postStateRoot = stateTree.root;
        const accountRoot = registry.root();

        const proof = {
            states: postStates,
            stateWitnesses,
            pubkeys,
            pubkeyWitnesses
        };
        const {
            0: gasCost,
            1: result
        } = await rollup.callStatic.testCheckSignature(
            signature,
            proof,
            postStateRoot,
            accountRoot,
            DOMAIN_HEX,
            spokeID,
            serialized
        );
        assert.equal(result, Result.Ok, `Got ${Result[result]}`);
        console.log("operation gas cost:", gasCost.toString());
    }).timeout(400000);
    it("checks state transitions", async function() {
        const txs = txMassMigrationFactory(states, COMMIT_SIZE, spokeID);
        const feeReceiver = 0;

        const preStateRoot = stateTree.root;
        const { proofs, safe } = stateTree.processMassMigrationCommit(
            txs,
            feeReceiver
        );
        assert.isTrue(safe, "Should be a valid applyTransferBatch");
        const postStateRoot = stateTree.root;
        const tokenID = states[0].tokenType;

        const leaves = txs.map(tx =>
            State.new(
                states[tx.fromIndex].pubkeyIndex,
                tokenID,
                tx.amount,
                0
            ).toStateLeaf()
        );
        const withdrawRoot = Tree.merklize(leaves).root;
        const commitmentBody = {
            accountRoot: constants.HashZero,
            signature: [0, 0],
            spokeID,
            withdrawRoot,
            tokenID,
            amount: sum(txs.map(tx => tx.amount)),
            feeReceiver,
            txs: serialize(txs)
        };

        const {
            0: gasCost,
            1: postRoot,
            2: result
        } = await rollup.callStatic.testProcessMassMigrationCommit(
            preStateRoot,
            COMMIT_SIZE,
            commitmentBody,
            proofs
        );
        console.log("processTransferBatch gas cost", gasCost.toNumber());
        assert.equal(postRoot, postStateRoot, "Mismatch post state root");
        assert.equal(Result[result], Result[Result.Ok]);
    }).timeout(80000);
});
