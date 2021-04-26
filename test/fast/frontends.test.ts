import { ethers } from "hardhat";
import { User } from "../../ts/factory";
import { TxCreate2Transfer, TxMassMigration, TxTransfer } from "../../ts/tx";
import { expectCallRevert, hexToUint8Array, randHex } from "../../ts/utils";
import * as mcl from "../../ts/mcl";
import { deployKeyless } from "../../ts/deployment/deploy";
import {
    FrontendCreate2TransferFactory,
    FrontendMassMigrationFactory,
    FrontendTransferFactory
} from "../../types/ethers-contracts";
import { Signer } from "ethers";
import { assert } from "chai";

describe("Frontend", function() {
    let snapshotId: number;
    let user: User;
    let badSig: mcl.solG1;
    let signer: Signer;
    const domain = randHex(32);
    before(async function() {
        await mcl.init();
        [signer] = await ethers.getSigners();
        user = User.new(0, 0, hexToUint8Array(domain));
        badSig = user.signRaw("0xf00d").sol;

        snapshotId = await ethers.provider.send("evm_snapshot", []);
    });
    beforeEach(async function() {
        // Reset to the state before pairing gas estimator is deployed
        await ethers.provider.send("evm_revert", [snapshotId]);
    });
    it("frontendTransfer", async function() {
        const txTransfer = TxTransfer.rand();

        const contract = await new FrontendTransferFactory(signer).deploy();
        const goodArgsCall = async () => {
            return await contract.validate(
                txTransfer.encodeOffchain(),
                user.sign(txTransfer).sol,
                user.pubkey,
                domain
            );
        };
        // Failing for no pairing gas estimator
        await expectCallRevert(goodArgsCall(), null);

        // deploying pairing gas estimator
        await deployKeyless(signer, false);

        // Success for having pairing gas estimator
        assert.isTrue(await goodArgsCall());

        await expectCallRevert(
            contract.validate(
                txTransfer.encodeOffchain(),
                badSig,
                user.pubkey,
                domain
            ),
            "Bad signature"
        );
    });
    it("frontendMassMigration", async function() {
        const txMassMigration = TxMassMigration.rand();
        const contract = await new FrontendMassMigrationFactory(
            signer
        ).deploy();
        const goodArgsCall = async () => {
            return await contract.validate(
                txMassMigration.encodeOffchain(),
                user.sign(txMassMigration).sol,
                user.pubkey,
                domain
            );
        };
        await expectCallRevert(goodArgsCall(), null);
        await deployKeyless(signer, false);
        assert.isTrue(await goodArgsCall());
        await expectCallRevert(
            contract.validate(
                txMassMigration.encodeOffchain(),
                badSig,
                user.pubkey,
                domain
            ),
            "Bad signature"
        );
    });
    it("frontendCreate2Transfer", async function() {
        const txCreate2Transfer = TxCreate2Transfer.rand();
        const contract = await new FrontendCreate2TransferFactory(
            signer
        ).deploy();
        const goodArgsCall = async () => {
            return await contract.validate(
                txCreate2Transfer.encodeOffchain(),
                user.sign(txCreate2Transfer).sol,
                user.pubkey,
                txCreate2Transfer.toPubkey,
                domain
            );
        };
        await expectCallRevert(goodArgsCall(), null);
        await deployKeyless(signer, false);
        assert.isTrue(await goodArgsCall());
        await expectCallRevert(
            contract.validate(
                txCreate2Transfer.encodeOffchain(),
                badSig,
                user.pubkey,
                txCreate2Transfer.toPubkey,
                domain
            ),
            "Bad signature"
        );
    });
});
