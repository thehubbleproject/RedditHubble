import { assert } from "chai";
import { TxTransfer } from "../ts/tx";
import { EMPTY_STATE } from "../ts/state";
import { RollupUtilsFactory } from "../types/ethers-contracts/RollupUtilsFactory";
import { RollupUtils } from "../types/ethers-contracts/RollupUtils";
import { ethers } from "@nomiclabs/buidler";
import { MassMigrationCommitment, TransferCommitment } from "../ts/commitments";

describe("RollupUtils", async function() {
    let RollupUtilsInstance: RollupUtils;
    before(async function() {
        const [signer, ...rest] = await ethers.getSigners();
        RollupUtilsInstance = await new RollupUtilsFactory(signer).deploy();
    });

    it("test state encoding and decoding", async function() {
        const state = EMPTY_STATE;

        const encodedState = await RollupUtilsInstance.BytesFromState(
            state
        );
        const decoded = await RollupUtilsInstance.StateFromBytes(
            encodedState
        );
        assert.equal(decoded.pubkeyIndex.toNumber(), state.pubkeyIndex);
        assert.equal(decoded.balance.toNumber(), state.balance);
        assert.equal(decoded.nonce.toNumber(), state.nonce);
        assert.equal(decoded.tokenType.toNumber(), state.tokenType);
    });
    it("test transfer utils", async function() {
        const txRaw = TxTransfer.rand();
        const tx = txRaw.extended();
        const signBytes = await RollupUtilsInstance.getTxSignBytes(tx);
        assert.equal(signBytes, txRaw.message());
        const txBytes = await RollupUtilsInstance.BytesFromTx(tx);

        const txData = await RollupUtilsInstance.TxFromBytes(txBytes);
        assert.equal(txData.fromIndex.toNumber(), tx.fromIndex);
        assert.equal(txData.toIndex.toNumber(), tx.toIndex);
        assert.equal(txData.tokenType.toNumber(), tx.tokenType);
        assert.equal(txData.nonce.toNumber(), tx.nonce);
        assert.equal(txData.txType.toNumber(), tx.txType);
        assert.equal(txData.amount.toString(), tx.amount.toString());
        await RollupUtilsInstance.CompressTransferFromEncoded(txBytes, "0x00");
        const txs = await RollupUtilsInstance.CompressManyTransferFromEncoded(
            [txBytes, txBytes],
            ["0x00", "0x00"]
        );
        await RollupUtilsInstance.DecompressManyTransfer(txs);
    });
    it("test transfer commitment", async function() {
        const commitment = TransferCommitment.new();
        const hash = await RollupUtilsInstance.TransferCommitmentToHash(
            commitment.toSolStruct()
        );
        assert.equal(hash, commitment.hash());
    });
    it("test mass migration commitment", async function() {
        const commitment = MassMigrationCommitment.new();
        const hash = await RollupUtilsInstance.MMCommitmentToHash(
            commitment.toSolStruct()
        );
        assert.equal(hash, commitment.hash());
    });
});
