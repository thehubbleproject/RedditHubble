import * as chai from "chai";
import * as walletHelper from "../../scripts/helpers/wallet";
const TestToken = artifacts.require("TestToken");
const chaiAsPromised = require("chai-as-promised");
const DepositManager = artifacts.require("DepositManager");
import * as utils from "../../scripts/helpers/utils";
import { ethers } from "ethers";
import { Wallet } from "../../scripts/helpers/interfaces";

chai.use(chaiAsPromised);

contract("DepositManager", async function(accounts) {
    let wallets: Wallet[];
    before(async function() {
        wallets = walletHelper.generateFirstWallets(walletHelper.mnemonics, 10);
    });

    it("should register a token", async function() {
        let testToken = await TestToken.deployed();
        let tokenRegistryInstance = await utils.getTokenRegistry();
        let registerTokenReceipt = await tokenRegistryInstance.requestTokenRegistration(
            testToken.address,
            { from: wallets[0].getAddressString() }
        );
    });

    it("should finalise token registration", async () => {
        let testToken = await TestToken.deployed();

        let tokenRegistryInstance = await utils.getTokenRegistry();

        let approveToken = await tokenRegistryInstance.finaliseTokenRegistration(
            testToken.address,
            { from: wallets[0].getAddressString() }
        );

        assert(approveToken, "token registration failed");
    });

    // ----------------------------------------------------------------------------------
    it("should approve Rollup on TestToken", async () => {
        let testToken = await TestToken.deployed();
        let depositManagerInstance = await DepositManager.deployed();
        let approveToken = await testToken.approve(
            depositManagerInstance.address,
            ethers.utils.parseEther("1").toString(),
            {
                from: wallets[0].getAddressString()
            }
        );
        assert(approveToken, "approveToken failed");
    });

    it("should allow doing one deposit", async () => {
        let depositManagerInstance = await DepositManager.deployed();
        var Alice = {
            Address: wallets[0].getAddressString(),
            Pubkey: wallets[0].getPublicKeyString(),
            Amount: 10,
            TokenType: 1,
            AccID: 1,
            Path: "2"
        };
        var Bob = {
            Address: wallets[1].getAddressString(),
            Pubkey: wallets[1].getPublicKeyString(),
            Amount: 10,
            TokenType: 1,
            AccID: 2,
            Path: "3"
        };
        await depositManagerInstance.deposit(
            Alice.Amount,
            Alice.TokenType,
            Alice.Pubkey
        );
        await depositManagerInstance.depositFor(
            Bob.Address,
            Bob.Amount,
            Bob.TokenType,
            Bob.Pubkey
        );
    });
});
