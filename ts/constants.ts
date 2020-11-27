import { DeploymentParameters } from "./interfaces";
import { toWei } from "./utils";

export const TESTING_PARAMS: DeploymentParameters = {
    MAX_DEPTH: 4,
    MAX_DEPOSIT_SUBTREE_DEPTH: 1,
    STAKE_AMOUNT: toWei("0.1"),
    BLOCKS_TO_FINALISE: 5,
    MIN_GAS_LEFT: 300000,
    USE_BURN_AUCTION: false,
    MAX_TXS_PER_COMMIT: 32
};

export const COMMIT_SIZE = 32;
export const STATE_TREE_DEPTH = 32;

// ethers.utils.keccak256(ethers.constants.HashZero)
export const ZERO_BYTES32 =
    "0x290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563";
