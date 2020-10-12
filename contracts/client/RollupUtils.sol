pragma solidity ^0.5.15;
pragma experimental ABIEncoderV2;

import { Tx } from "../libs/Tx.sol";
import { Types } from "../libs/Types.sol";

contract RollupUtils {
    using Tx for bytes;
    using Types for Types.UserState;

    function TransferCommitmentToHash(
        Types.TransferCommitment memory commitment
    ) public pure returns (bytes32) {
        return Types.toHash(commitment);
    }

    function MMCommitmentToHash(Types.MassMigrationCommitment memory commitment)
        public
        pure
        returns (bytes32)
    {
        return Types.toHash(commitment);
    }

    function StateFromBytes(bytes memory stateBytes)
        public
        pure
        returns (Types.UserState memory state)
    {
        (state.pubkeyIndex, state.tokenType, state.balance, state.nonce) = abi
            .decode(stateBytes, (uint256, uint256, uint256, uint256));
    }

    function BytesFromState(Types.UserState memory state)
        public
        pure
        returns (bytes memory)
    {
        return state.encode();
    }

    function HashFromState(Types.UserState memory state)
        public
        pure
        returns (bytes32)
    {
        return keccak256(state.encode());
    }

    function GetGenesisLeaves() public pure returns (bytes32[2] memory leaves) {
        Types.UserState memory state1;
        state1.pubkeyIndex = 0;
        Types.UserState memory state2;
        state2.pubkeyIndex = 1;
        leaves[0] = keccak256(state1.encode());
        leaves[1] = keccak256(state2.encode());
    }

    // ---------- Tx Related Utils -------------------

    //
    // Transfer
    //

    function BytesFromTx(Types.Transfer memory _tx)
        public
        pure
        returns (bytes memory)
    {
        return
            abi.encodePacked(
                _tx.txType,
                _tx.fromIndex,
                _tx.toIndex,
                _tx.nonce,
                _tx.amount,
                _tx.fee
            );
    }

    function TxFromBytes(bytes memory txBytes)
        public
        pure
        returns (Types.Transfer memory)
    {
        // TODO: use txBytes.transfer_transfer_encodedFromBytes(...)
        Types.Transfer memory transaction;
        (
            transaction.txType,
            transaction.fromIndex,
            transaction.toIndex,
            transaction.nonce,
            transaction.amount,
            transaction.fee
        ) = abi.decode(
            txBytes,
            (uint256, uint256, uint256, uint256, uint256, uint256)
        );
        return transaction;
    }

    function getTxSignBytes(Types.Transfer memory _tx)
        public
        pure
        returns (bytes memory)
    {
        return BytesFromTx(_tx);
    }

    function DecompressTransfers(bytes memory txs)
        public
        pure
        returns (Tx.Transfer[] memory)
    {
        uint256 length = txs.transfer_size();
        Tx.Transfer[] memory _txs = new Tx.Transfer[](length);
        for (uint256 i = 0; i < length; i++) {
            _txs[i] = txs.transfer_decode(i);
        }
        return _txs;
    }

    function HashFromTx(Types.Transfer memory _tx)
        public
        pure
        returns (bytes32)
    {
        return keccak256(BytesFromTx(_tx));
    }

    function CompressTransferFromEncoded(bytes memory txBytes, bytes memory sig)
        public
        pure
        returns (bytes memory)
    {
        Types.Transfer memory _tx = TxFromBytes(txBytes);
        Tx.Transfer[] memory _txs = new Tx.Transfer[](1);
        _txs[0] = Tx.Transfer(_tx.fromIndex, _tx.toIndex, _tx.amount, _tx.fee);
        return Tx.serialize(_txs);
    }

    function CompressManyTransferFromEncoded(
        bytes[] memory txBytes,
        bytes[] memory sigs
    ) public pure returns (bytes memory) {
        Tx.Transfer[] memory _txs = new Tx.Transfer[](txBytes.length);
        for (uint256 i = 0; i < txBytes.length; i++) {
            Types.Transfer memory _tx = TxFromBytes(txBytes[i]);
            _txs[i] = Tx.Transfer(
                _tx.fromIndex,
                _tx.toIndex,
                _tx.amount,
                _tx.fee
            );
        }
        return Tx.serialize(_txs);
    }

    function DecompressManyTransfer(bytes memory txs)
        public
        pure
        returns (Tx.Transfer[] memory structTxs)
    {
        uint256 length = txs.transfer_size();
        structTxs = new Tx.Transfer[](length);
        for (uint256 i = 0; i < length; i++) {
            structTxs[i] = txs.transfer_decode(i);
        }
        return structTxs;
    }

    //
    // Create2Transfer
    //

    function BytesFromTx(
        uint256 txType,
        uint256[4] memory from,
        uint256[4] memory to,
        uint256 toAccID,
        uint256 nonce,
        uint256 amount,
        uint256 fee
    ) public pure returns (bytes memory) {
        return abi.encodePacked(txType, from, to, toAccID, nonce, amount, fee);
    }

    function BytesFromTx(Types.Create2Transfer memory _tx)
        public
        pure
        returns (bytes memory)
    {
        return
            abi.encodePacked(
                _tx.txType,
                _tx.fromIndex,
                _tx.toIndex,
                _tx.toAccID,
                _tx.nonce,
                _tx.amount,
                _tx.fee
            );
    }

    function Create2TransferFromBytes(bytes memory txBytes)
        public
        pure
        returns (Types.Create2Transfer memory)
    {
        // TODO: use txBytes.transfer_transfer_encodedFromBytes(...)
        Types.Create2Transfer memory transaction;
        (
            transaction.txType,
            transaction.fromIndex,
            transaction.toIndex,
            transaction.toAccID,
            transaction.nonce,
            transaction.amount,
            transaction.fee
        ) = abi.decode(
            txBytes,
            (uint256, uint256, uint256, uint256, uint256, uint256, uint256)
        );
        return transaction;
    }

    // NOTE: GetSignBytes for create2Account doesnt include toAccID as its not known while transaction signing
    // toAccID is included by the coordinator at the time of compression.
    function getTxSignBytes(
        uint256 txType,
        uint256[4] memory from,
        uint256[4] memory to,
        uint256 nonce,
        uint256 amount,
        uint256 fee
    ) public pure returns (bytes32) {
        return
            keccak256(abi.encodePacked(txType, from, to, nonce, amount, fee));
    }

    // NOTE: txBytes is from BytesFromTx() using from/to as public keys
    function Create2PubkeyToIndex(
        bytes memory txBytes,
        uint256 from,
        uint256 to,
        uint256 toAccID
    ) public pure returns (bytes memory) {
        Types.Create2Transfer memory transaction;
        (
            transaction.txType,
            ,
            ,
            toAccID,
            transaction.nonce,
            transaction.amount,
            transaction.fee
        ) = abi.decode(
            txBytes,
            (
                uint256,
                uint256[4],
                uint256[4],
                uint256,
                uint256,
                uint256,
                uint256
            )
        );

        transaction.fromIndex = from;
        transaction.toIndex = to;
        transaction.toAccID = toAccID;
        return BytesFromTx(transaction);
    }

    function Create2IndexToPubkey(
        bytes memory txBytes,
        uint256[4] memory from,
        uint256[4] memory to
    ) public pure returns (bytes memory) {
        Types.Create2Transfer memory transaction = Create2TransferFromBytes(
            txBytes
        );
        return
            abi.encodePacked(
                transaction.txType,
                from,
                to,
                transaction.toAccID,
                transaction.nonce,
                transaction.amount,
                transaction.fee
            );
    }
}