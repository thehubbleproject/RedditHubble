import { ethers } from "@nomiclabs/buidler";
import { assert } from "chai";
import { TestBitmapFactory } from "../types/ethers-contracts";
import { TestBitmap } from "../types/ethers-contracts/TestBitmap";

describe("Bitmap", async () => {
    let contract: TestBitmap;
    before(async function() {
        const [singer] = await ethers.getSigners();
        contract = await new TestBitmapFactory(singer).deploy();
    });

    it("claims", async function() {
        const indices = [0, 123, 255, 256, 257, 10000000];
        for (const index of indices) {
            assert.isFalse(await contract.testIsClaimed(index));
            await contract.testSetClaimed(index);
            assert.isTrue(await contract.testIsClaimed(index));
        }
    });
});
