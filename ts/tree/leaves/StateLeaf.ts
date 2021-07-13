import { State } from "../../state";
import { stateDB } from "../../client/database/connection";
import { Leaf, getLeafKey, LeafFactoryFunc } from "./Leaf";

const stateName = "stateLeaf";

export function StateLeafFactory(): LeafFactoryFunc<State> {
    const name = stateName;

    const newLeaf = (item: State, itemID: number) => {
        return StateLeaf.new(item, itemID);
    };

    const fromDB = async (itemId: number) => {
        return await StateLeaf.fromDB(itemId);
    };

    return { name, newLeaf, fromDB };
}

export class StateLeaf extends Leaf<State> {
    name = stateName;
    db = stateDB;

    static new(item: State, itemID: number): StateLeaf {
        return new StateLeaf(item, itemID);
    }

    static async fromDB(itemId: number): Promise<StateLeaf> {
        const key = getLeafKey(stateName, itemId);
        const bytes = await stateDB.get(key);
        const item = State.fromEncoded(bytes);
        return new StateLeaf(item, itemId);
    }

    static fromState(state: State, itemId: number) {
        return new StateLeaf(state, itemId);
    }
}
