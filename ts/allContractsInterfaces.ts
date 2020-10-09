import { ParamManager } from "../types/ethers-contracts/ParamManager";
import { RollupUtils } from "../types/ethers-contracts/RollupUtils";
import { NameRegistry } from "../types/ethers-contracts/NameRegistry";
import { Governance } from "../types/ethers-contracts/Governance";
import { MerkleTreeUtils } from "../types/ethers-contracts/MerkleTreeUtils";
import { Logger } from "../types/ethers-contracts/Logger";
import { TokenRegistry } from "../types/ethers-contracts/TokenRegistry";
import { Pob } from "../types/ethers-contracts/Pob";
import { Transfer } from "../types/ethers-contracts/Transfer";
import { TestToken } from "../types/ethers-contracts/TestToken";
import { DepositManager } from "../types/ethers-contracts/DepositManager";
import { Rollup } from "../types/ethers-contracts/Rollup";
import { BlsAccountRegistry } from "../types/ethers-contracts/BlsAccountRegistry";
import { MassMigration } from "../types/ethers-contracts/MassMigration";
import { Vault } from "../types/ethers-contracts/Vault";
import { WithdrawManager } from "../types/ethers-contracts/WithdrawManager";
import { SpokeRegistry } from "../types/ethers-contracts/SpokeRegistry";

export interface allContracts {
    paramManager: ParamManager;
    rollupUtils: RollupUtils;
    nameRegistry: NameRegistry;
    governance: Governance;
    logger: Logger;
    merkleTreeUtils: MerkleTreeUtils;
    blsAccountRegistry: BlsAccountRegistry;
    tokenRegistry: TokenRegistry;
    transfer: Transfer;
    massMigration: MassMigration;
    pob: Pob;
    testToken: TestToken;
    spokeRegistry: SpokeRegistry;
    vault: Vault;
    depositManager: DepositManager;
    rollup: Rollup;
    withdrawManager: WithdrawManager;
}
