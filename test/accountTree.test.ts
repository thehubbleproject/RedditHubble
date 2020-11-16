import { TestAccountTreeFactory } from "../types/ethers-contracts/TestAccountTreeFactory";
import { TestAccountTree } from "../types/ethers-contracts/TestAccountTree";
import { Tree, Hasher } from "../ts/tree";
import { ethers } from "hardhat";
import { assert } from "chai";
import { randHex, randomLeaves } from "../ts/utils";

let DEPTH: number;
let BATCH_DEPTH: number;
describe("Account Tree", async () => {
    let accountTree: TestAccountTree;
    let treeLeft: Tree;
    let treeRight: Tree;
    let hasher: Hasher;
    beforeEach(async function() {
        const accounts = await ethers.getSigners();
        accountTree = await new TestAccountTreeFactory(accounts[0]).deploy();
        DEPTH = (await accountTree.DEPTH()).toNumber();
        BATCH_DEPTH = (await accountTree.BATCH_DEPTH()).toNumber();
        treeLeft = Tree.new(DEPTH);
        treeRight = Tree.new(DEPTH);
        hasher = treeLeft.hasher;
    });
    it("empty tree construction", async function() {
        for (let i = 0; i < DEPTH; i++) {
            const zi = await accountTree.zeros(i);
            const fstLeft = await accountTree.filledSubtreesLeft(i);
            assert.equal(treeLeft.zeros[DEPTH - i], zi);
            assert.equal(fstLeft, zi);
            if (i < DEPTH - BATCH_DEPTH) {
                const zi = await accountTree.zeros(i + BATCH_DEPTH);
                const fstRight = await accountTree.filledSubtreesRight(i);
                assert.equal(treeRight.zeros[DEPTH - i - BATCH_DEPTH], zi);
                assert.equal(fstRight, zi);
            }
        }
        assert.equal(treeLeft.root, await accountTree.rootLeft());
        assert.equal(treeRight.root, await accountTree.rootRight());
        const root = hasher.hash2(treeLeft.root, treeRight.root);
        assert.equal(root, await accountTree.root());
    });
    it("update with single leaf", async function() {
        for (let i = 0; i < 33; i++) {
            const leaf = randHex(32);
            treeLeft.updateSingle(i, leaf);
            await accountTree.updateSingle(leaf);
            assert.equal(treeLeft.root, await accountTree.rootLeft());
            const root = hasher.hash2(treeLeft.root, treeRight.root);
            assert.equal(root, await accountTree.root());
        }
    });
    it("batch update", async function() {
        const batchSize = 1 << BATCH_DEPTH;
        for (let k = 0; k < 4; k++) {
            const leafs = randomLeaves(batchSize);
            treeRight.updateBatch(batchSize * k, leafs);
            await accountTree.updateBatch(leafs);
            assert.equal(treeRight.root, await accountTree.rootRight());
            const root = hasher.hash2(treeLeft.root, treeRight.root);
            assert.equal(root, await accountTree.root());
        }
    }).timeout(50000);
    it("witness for left side", async function() {
        let leafs = randomLeaves(16);
        for (let i = 0; i < leafs.length; i++) {
            treeLeft.updateSingle(i, leafs[i]);
            await accountTree.updateSingle(leafs[i]);
        }
        for (let i = 0; i < 16; i++) {
            let leafIndex = i;
            let leaf = leafs[i];
            let witness = treeLeft.witness(i).nodes;
            const { 1: result } = await accountTree.callStatic.checkInclusion(
                leaf,
                leafIndex,
                witness
            );
            assert.isTrue(result);
        }
    });
    it("witness for right side", async function() {
        const batchSize = 1 << BATCH_DEPTH;
        const leafs = randomLeaves(batchSize);
        treeRight.updateBatch(0, leafs);
        await accountTree.updateBatch(leafs);
        let offset = ethers.BigNumber.from(2).pow(ethers.BigNumber.from(DEPTH));
        for (let i = 0; i < batchSize; i += 41) {
            const leafIndex = offset.add(i);
            let leaf = leafs[i];
            let witness = treeRight.witness(i).nodes;
            let { 1: result } = await accountTree.callStatic.checkInclusion(
                leaf,
                leafIndex,
                witness
            );
            assert.isTrue(result);
        }
    });

    it("gas cost: update tree single", async function() {
        const leaf = ethers.utils.randomBytes(32);
        const gasCost = await accountTree.callStatic.updateSingle(leaf);
        console.log(gasCost.toNumber());
    });
    it("gas cost: update tree batch", async function() {
        const leafs = randomLeaves(1 << BATCH_DEPTH);
        const gasCost = await accountTree.callStatic.updateBatch(leafs);
        console.log(gasCost.toNumber());
    });
});
