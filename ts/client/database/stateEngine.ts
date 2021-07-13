import { State } from "../../state";
import { StateLeafFactory } from "../../tree/leaves/StateLeaf";
import { StorageEngine } from "../storageEngine/interfaces";
import { DatabaseEngine } from "./databaseEngine";

export interface StateStorageEngine extends StorageEngine<State> {}

export class StateDatabaseEngine extends DatabaseEngine<State>
    implements StateStorageEngine {
    constructor(depth: number) {
        super(depth, StateLeafFactory());
    }
}
