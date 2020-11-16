import { randomLeaves } from "../ts/utils";
import { assert } from "chai";
import { ethers } from "hardhat";
import { Tree } from "../ts/tree";
import { TestMerkleTreeFactory } from "../types/ethers-contracts/TestMerkleTreeFactory";
import { TestMerkleTree } from "../types/ethers-contracts/TestMerkleTree";

describe("MerkleTree", async function() {
    const MAX_DEPTH = 32;
    let contract: TestMerkleTree;
    before(async function() {
        const [signer] = await ethers.getSigners();
        contract = await new TestMerkleTreeFactory(signer).deploy();
    });
    it("verify", async function() {
        const size = 50;
        let totalCost = 0;
        const leaves = randomLeaves(size);
        const tree = Tree.new(MAX_DEPTH);
        tree.updateBatch(0, leaves);
        for (const [path, leaf] of leaves.entries()) {
            const {
                0: result,
                1: gasCost
            } = await contract.callStatic.testVerify(
                tree.root,
                leaf,
                path,
                tree.witness(path).nodes
            );
            assert.isTrue(result);
            totalCost += gasCost.toNumber();
        }
        console.log("Average cost of verifying a leaf", totalCost / size);
    });

    it("merklize", async function() {
        const sizes = [1, 5, 10, 20, 32];
        for (const size of sizes) {
            const leaves = randomLeaves(size);
            const {
                0: root,
                1: gasCost
            } = await contract.callStatic.testMerklise(leaves);
            assert.equal(root, Tree.merklize(leaves).root);
            console.log(
                `Merklizing ${size} leaves onchain`,
                gasCost.toNumber()
            );
        }
    });
    it("testGetRoot", async function() {
        const levels = [0, 5, 10, 20, 31];
        for (const level of levels) {
            const { 1: gasCost } = await contract.callStatic.testGetRoot(level);
            console.log(`Get Root at level ${level}`, gasCost.toNumber());
        }
    });
});
