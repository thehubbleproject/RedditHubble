pragma solidity ^0.5.15;

import "@openzeppelin/contracts/utils/Address.sol";

contract Proxy {
    bytes32
        private constant IMPLEMENTATION_SLOT = 0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3;

    function() external payable {
        _fallback();
    }

    // solium-disable-next-line no-empty-blocks
    constructor() public {}

    function __initialize__(address implementation) external {
        require(_implementation() == address(0), "Proxy: already initialized");
        require(implementation != address(0), "Proxy: zero address");
        require(
            Address.isContract(implementation),
            "Proxy: non contract address"
        );
        bytes32 slot = IMPLEMENTATION_SLOT;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            sstore(slot, implementation)
        }
    }

    function __implementation__() external view returns (address) {
        return _implementation();
    }

    // solium-disable-next-line no-empty-blocks
    function _willFallback() internal {}

    function _fallback() internal {
        _willFallback();
        _delegate(_implementation());
    }

    function _delegate(address implementation) internal {
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            calldatacopy(0, 0, calldatasize)
            let result := delegatecall(
                gas,
                implementation,
                0,
                calldatasize,
                0,
                0
            )
            returndatacopy(0, 0, returndatasize)
            switch result
                case 0 {
                    revert(0, returndatasize)
                }
                default {
                    return(0, returndatasize)
                }
        }
    }

    function _implementation() internal view returns (address impl) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            impl := sload(slot)
        }
    }
}