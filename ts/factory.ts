import { BigNumber, Wallet } from "ethers";
import { BlsSigner } from "./blsSigner";
import { PubkeyDatabaseEngine, StateDatabaseEngine } from "./client/database";
import { StorageManager } from "./client/storageEngine";
import { BatchMemoryStorage } from "./client/storageEngine/batches/memory";
import { TransactionMemoryStorage } from "./client/storageEngine/transactions/memory";
import { DEFAULT_MNEMONIC } from "./constants";
import { float16, USDT } from "./decimal";
import { UserNotExist } from "./exceptions";
import { Domain, solG1 } from "./mcl";
import { State } from "./state";
import { nullProvider, StateProvider } from "./stateTree";
import {
    TxTransfer,
    TxCreate2Transfer,
    TxMassMigration,
    SignableTx,
    getAggregateSig
} from "./tx";

export class User {
    private tokenIDtoStateID: Record<number, number>;

    static new(
        stateID: number,
        pubkeyID: number,
        domain?: Domain,
        privKey?: string
    ) {
        const signer = BlsSigner.new(domain, privKey);
        const user = new this(signer, pubkeyID);
        user.addStateID(0, stateID);
        return user;
    }
    constructor(public blsSigner: BlsSigner, public pubkeyID: number) {
        this.tokenIDtoStateID = [];
    }
    public sign(tx: SignableTx) {
        return this.blsSigner.sign(tx.message());
    }
    public signRaw(message: string) {
        return this.blsSigner.sign(message);
    }
    public setDomain(domain: Domain) {
        this.blsSigner.setDomain(domain);
        return this;
    }
    public addStateID(tokenID: number, stateID: number) {
        if (this.tokenIDtoStateID[tokenID] !== undefined) {
            throw new Error(`stateID alreadt set for tokenID ${tokenID}`);
        }

        this.tokenIDtoStateID[tokenID] = stateID;
    }
    public getStateID(tokenID: number): number {
        if (this.tokenIDtoStateID[tokenID] === undefined) {
            throw new Error(`stateID missing for tokenID ${tokenID}`);
        }

        return this.tokenIDtoStateID[tokenID];
    }
    public clearStateIDs() {
        this.tokenIDtoStateID = {};
    }

    get stateID() {
        return this.getStateID(0);
    }
    get pubkey() {
        return this.blsSigner.pubkey;
    }
    toString() {
        return `<User stateID: ${this.stateID}  pubkeyID: ${this.pubkeyID}>`;
    }
}

interface GroupOptions {
    n: number;
    domain?: Domain;
    stateProvider?: StateProvider;
    initialStateID?: number;
    initialPubkeyID?: number;
    mnemonic?: string;
}

interface createStateOptions {
    initialBalance?: BigNumber;
    tokenID?: number;
    zeroNonce?: boolean;
}

export class Group {
    static new(options: GroupOptions) {
        const initialStateID = options.initialStateID || 0;
        const initialPubkeyID = options.initialPubkeyID || 0;
        const stateProvider = options.stateProvider || nullProvider;
        const mnemonic = options.mnemonic ?? DEFAULT_MNEMONIC;
        const users: User[] = [];
        for (let i = 0; i < options.n; i++) {
            const wallet = Wallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${i}`);
            const stateID = initialStateID + i;
            const pubkeyID = initialPubkeyID + i;
            users.push(
                User.new(stateID, pubkeyID, options.domain, wallet.privateKey)
            );
        }
        return new this(users, stateProvider);
    }
    constructor(private users: User[], private stateProvider: StateProvider) {}
    public connect(provider: StateProvider) {
        this.stateProvider = provider;
        return this;
    }
    public setupSigners(domain: Domain) {
        for (const user of this.users) {
            user.setDomain(domain);
        }
    }
    get size() {
        return this.users.length;
    }
    public *userIterator() {
        for (const user of this.users) {
            yield user;
        }
    }
    // Useful when want to divide users into sub-groups
    public *groupInterator(subgroupSize: number) {
        let subgroup = [];
        for (const user of this.users) {
            subgroup.push(user);
            if (subgroup.length == subgroupSize) {
                yield new Group(subgroup, this.stateProvider);
                subgroup = [];
            }
        }
    }
    public pickRandom(): { user: User; index: number } {
        const index = Math.floor(Math.random() * this.users.length);
        const user = this.users[index];
        return { user, index };
    }
    public join(other: Group) {
        const allUsers = [];
        for (const user of this.userIterator()) {
            allUsers.push(user);
        }
        for (const user of other.userIterator()) {
            allUsers.push(user);
        }
        return new Group(allUsers, this.stateProvider);
    }
    public slice(n: number) {
        if (n > this.users.length)
            throw new UserNotExist(
                `Want ${n} users but this group has only ${this.users.length} users`
            );
        return new Group(this.users.slice(0, n), this.stateProvider);
    }
    public getUser(i: number) {
        if (i >= this.users.length) throw new UserNotExist(`${i}`);
        return this.users[i];
    }
    public getState(user: User) {
        return this.stateProvider.getState(user.stateID).state;
    }
    public getPubkeys() {
        return this.users.map(user => user.pubkey);
    }
    public getPubkeyIDs() {
        return this.users.map(user => user.pubkeyID);
    }

    public syncState(): State[] {
        const states: State[] = [];
        for (const user of this.users) {
            const state = this.stateProvider.getState(user.stateID).state;
            states.push(state);
        }
        return states;
    }
    public createStates(options?: createStateOptions) {
        const initialBalance =
            options?.initialBalance || USDT.fromHumanValue("1000.0").l2Value;
        const tokenID = options?.tokenID === undefined ? 5678 : options.tokenID;
        const zeroNonce = options?.zeroNonce || false;
        const arbitraryInitialNonce = 9;
        for (let i = 0; i < this.users.length; i++) {
            const user = this.users[i];
            const nonce = zeroNonce ? 0 : arbitraryInitialNonce + i;
            const state = State.new(
                user.pubkeyID,
                tokenID,
                initialBalance,
                nonce
            );
            this.stateProvider.createState(user.stateID, state);
        }
    }
}

// Created n transfers from Group of Users, if n is greater than the size of the group, balance is not guaranteed to be sufficient
export function txTransferFactory(
    group: Group,
    n: number
): { txs: TxTransfer[]; signature: solG1; senders: User[] } {
    const txs: TxTransfer[] = [];
    const senders = [];
    const seenNonce: { [stateID: number]: number } = {};
    for (let i = 0; i < n; i++) {
        const sender = group.getUser(i % group.size);
        const receiver = group.getUser((i + 5) % group.size);
        const senderState = group.getState(sender);
        const amount = float16.round(senderState.balance.div(10));
        const fee = float16.round(amount.div(10));
        const nonce = seenNonce[sender.stateID]
            ? seenNonce[sender.stateID] + 1
            : senderState.nonce.toNumber();
        seenNonce[sender.stateID] = nonce;
        const tx = new TxTransfer(
            sender.stateID,
            receiver.stateID,
            amount,
            fee,
            nonce
        );
        tx.signature = sender.sign(tx);
        txs.push(tx);
        senders.push(sender);
    }
    const signature = getAggregateSig(txs);
    return { txs, signature, senders };
}

// creates N new transactions with existing sender and non-existent receiver
export function txCreate2TransferFactory(
    registered: Group,
    unregistered: Group
): { txs: TxCreate2Transfer[]; signature: solG1; senders: User[] } {
    const txs: TxCreate2Transfer[] = [];
    const senders = [];
    const seenNonce: { [stateID: number]: number } = {};
    const n = Math.max(registered.size, unregistered.size);
    for (let i = 0; i < n; i++) {
        const sender = registered.getUser(i % registered.size);
        const reciver = unregistered.getUser(i % unregistered.size);
        const senderState = registered.getState(sender);
        const amount = float16.round(senderState.balance.div(10));
        const fee = float16.round(amount.div(10));
        const nonce = seenNonce[sender.stateID]
            ? seenNonce[sender.stateID] + 1
            : senderState.nonce.toNumber();
        seenNonce[sender.stateID] = nonce;

        const tx = new TxCreate2Transfer(
            sender.stateID,
            reciver.stateID,
            reciver.pubkey,
            reciver.pubkeyID,
            amount,
            fee,
            nonce
        );
        tx.signature = sender.sign(tx);
        txs.push(tx);
        senders.push(sender);
    }
    const signature = getAggregateSig(txs);
    return { txs, signature, senders };
}

export function txMassMigrationFactory(
    group: Group,
    spokeID = 0
): { txs: TxMassMigration[]; signature: solG1; senders: User[] } {
    const txs: TxMassMigration[] = [];
    const senders = [];
    const seenNonce: { [stateID: number]: number } = {};
    for (const sender of group.userIterator()) {
        const senderState = group.getState(sender);
        const amount = float16.round(senderState.balance.div(10));
        const fee = float16.round(amount.div(10));
        const nonce = seenNonce[sender.stateID]
            ? seenNonce[sender.stateID] + 1
            : senderState.nonce.toNumber();
        seenNonce[sender.stateID] = nonce;

        const tx = new TxMassMigration(
            sender.stateID,
            amount,
            spokeID,
            fee,
            nonce
        );
        tx.signature = sender.sign(tx);
        txs.push(tx);
        senders.push(sender);
    }
    const signature = getAggregateSig(txs);
    return { txs, signature, senders };
}

interface StorageManagerFactoryOptions {
    stateTreeDepth?: number;
    pubkeyTreeDepth?: number;
}

export async function storageManagerFactory(
    options?: StorageManagerFactoryOptions
): Promise<StorageManager> {
    const stateTreeDepth = options?.stateTreeDepth ?? 32;
    const pubkeyTreeDepth = options?.pubkeyTreeDepth ?? 32;
    return {
        pubkey: new PubkeyDatabaseEngine(pubkeyTreeDepth),
        state: new StateDatabaseEngine(stateTreeDepth),
        batches: new BatchMemoryStorage(),
        transactions: new TransactionMemoryStorage()
    };
}
