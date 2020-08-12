import {
    Account,
    AccountMerkleProof,
    PDALeaf,
    PDAMerkleProof
} from "./interfaces";
import {
    getZeroHash,
    defaultHashes,
    getParentLeaf,
    CreateAccountLeaf,
    PubKeyHash
} from "./utils";
import { DummyPDA, DummyAccount } from "./constants";
const MerkleTreeUtils = artifacts.require("MerkleTreeUtils");

interface LeafItem<T> {
    hash: string;
    data?: T;
}

abstract class AbstractStore<T> {
    items: LeafItem<T>[];
    size: number;
    level: number;
    stashedItems: LeafItem<T>[];

    constructor(level: number) {
        this.level = level;
        this.size = 2 ** level;
        this.items = [];
        this.stashedItems = [];
    }
    abstract async compress(element: T): Promise<string>;

    async insert(data: T): Promise<number> {
        const position = this.items.length;
        const hash = await this.compress(data);
        const item: LeafItem<T> = {
            hash,
            data
        };
        this.items.push(item);
        return position;
    }
    insertHash(hash: string): number {
        const position = this.items.length;
        const item: LeafItem<T> = { hash };
        this.items.push(item);
        return position;
    }

    nextEmptyIndex(): number {
        return this.items.length;
    }

    async update(position: number, data: T) {
        const hash = await this.compress(data);
        const item: LeafItem<T> = {
            hash,
            data
        };
        this.items[position] = item;
    }
    async updateHash(position: number, hash: string) {
        const item: LeafItem<T> = { hash };
        this.items[position] = item;
    }

    getLeaves(): string[] {
        const leaves: string[] = [];
        const zeroHash = getZeroHash(0);
        for (let i = 0; i < this.size; i++) {
            if (i < this.items.length) {
                leaves.push(this.items[i].hash);
            } else {
                leaves.push(zeroHash);
            }
        }
        return leaves;
    }

    async getRoot(): Promise<string> {
        const merkleTreeUtilsInstance = await MerkleTreeUtils.deployed();
        const leaves = this.getLeaves();
        const root = await merkleTreeUtilsInstance.getMerkleRootFromLeaves(
            leaves
        );
        return root;
    }
    _allBranches(): string[][] {
        const branches: string[][] = [];
        for (let i = 0; i < this.level; i++) {
            branches[i] = [];
        }
        branches[0] = this.getLeaves();
        for (let i = 1; i < this.level; i++) {
            for (let j = 0; j < 2 ** (this.level - i); j++) {
                branches[i][j] = getParentLeaf(
                    branches[i - 1][j * 2],
                    branches[i - 1][j * 2 + 1]
                );
            }
        }
        return branches;
    }
    getSubTreeSiblings(position: number, subtreeAtlevel: number): string[] {
        const sibilings: string[] = [];
        const allBranches = this._allBranches();
        let currentLevelPosition = position;
        for (let i = subtreeAtlevel; i < this.level; i++) {
            if (currentLevelPosition % 2 == 0) {
                sibilings.push(allBranches[i][currentLevelPosition + 1]);
            } else {
                sibilings.push(allBranches[i][currentLevelPosition - 1]);
            }
            currentLevelPosition = Math.floor(currentLevelPosition / 2);
        }
        return sibilings;
    }
    getSiblings(position: number): string[] {
        return this.getSubTreeSiblings(position, 0);
    }

    findEmptySubTreePosition(subtreeDepth: number): number {
        const zeroHashAtLevel = defaultHashes(subtreeDepth + 1)[subtreeDepth];
        const allBranches = this._allBranches();
        const leavesAtLevel = allBranches[subtreeDepth];
        for (let i = 0; i < leavesAtLevel.length; i++) {
            if (leavesAtLevel[i] == zeroHashAtLevel) {
                return i;
            }
        }
        throw Error("No empty leaf can be found");
    }
    setCheckpoint() {
        // deep copy
        this.stashedItems = JSON.parse(JSON.stringify(this.items));
    }
    restoreCheckpoint() {
        // deep copy
        this.items = JSON.parse(JSON.stringify(this.stashedItems));
    }
}

export class StateStore extends AbstractStore<Account> {
    async compress(element: Account): Promise<string> {
        return await CreateAccountLeaf(element);
    }
    async getSubTreeMerkleProof(
        pathToAccount: number,
        level: number
    ): Promise<AccountMerkleProof> {
        const siblings = this.getSubTreeSiblings(pathToAccount, level);
        return {
            accountIP: {
                pathToAccount: pathToAccount.toString(),
                account: DummyAccount
            },
            siblings
        };
    }

    async getAccountMerkleProof(
        position: number,
        allowDummy = false
    ): Promise<AccountMerkleProof> {
        if (!allowDummy && !this.items[position]?.data) {
            throw new Error("Account data not exists");
        }
        const account: Account = this.items[position]?.data || DummyAccount;
        const siblings = this.getSiblings(position);
        const pathToAccount = position.toString();

        return {
            accountIP: {
                pathToAccount,
                account
            },
            siblings
        };
    }
}

export class PublicKeyStore extends AbstractStore<PDALeaf> {
    async compress(element: PDALeaf): Promise<string> {
        return PubKeyHash(element.pubkey);
    }
    async insertPublicKey(pubkey: string): Promise<number> {
        const leaf: PDALeaf = {
            pubkey
        };
        return await this.insert(leaf);
    }

    async getPDAMerkleProof(
        position: number,
        allowDummy = false
    ): Promise<PDAMerkleProof> {
        if (!allowDummy && !this.items[position]?.data) {
            throw new Error("Public key data not exists");
        }
        const pubkey_leaf: PDALeaf = this.items[position]?.data || DummyPDA;
        const siblings = this.getSiblings(position);
        const pathToPubkey = position.toString();

        return {
            _pda: {
                pathToPubkey,
                pubkey_leaf
            },
            siblings
        };
    }
}
