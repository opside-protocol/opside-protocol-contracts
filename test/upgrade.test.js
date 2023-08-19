const { ethers } = require('hardhat');
const {expect} = require("chai");

const deployerPvtKeyRollup1 = '0x718c293a35b071383f429f3f4ba6d0cb6df636f846145edd36a5c4fd8ec70705'; // 0xB804af6525cE549E6dc35A79830D6d26B09c78e9
const timelockContractAddressRollup1 =  "0x40aC3aAF588512DA269f89A392861A1C3A9E328b";
const polygonZkEVMBridgeAddressRollup1 = "0x21dcC046ecE8e1F58Af587c47Fc7163F4cbF643b";
const proxyAdminAddressRollup1 = "0x98D1f8906B760Ff632b9d7B18d17aA1ec6DC7853";
const polygonZkEVMAddressRollup1 = "0xd7c6D2D69335efB1b8D7698D699B75daF7a78CFe";

const deployerPvtKeyRollup2 = '0x70e5e8438838b2c86be3ea3201bbd1137611dc30a3ef42f3489bbc880f43cad9';
const timelockContractAddressRollup2 =  "0xd17d4047556ED41c08Ef21D5CC10B2779f7574e9";
const polygonZkEVMBridgeAddressRollup2 = "0x772887e0619DC599F3A44d8A2BD2CB8AE204D4D5";
const proxyAdminAddressRollup2 = "0x44C553882C99b1c4841380bCD35f21B19edAE2CE";
const polygonZkEVMAddressRollup2 = "0x604B6D3FF5b5436b813D953081c59B964b81C29B";

describe("upgrade rollup contract", function () {
    beforeEach(async function () {
    });

    // npx hardhat test test/upgrade.test.js --network opsideDevnet --grep "1.upgrade rollup1 L1"
    it("1.upgrade rollup1 L1", async function () {
        let currentProvider = new ethers.providers.FallbackProvider([ethers.provider], 1);

        const FEE_DATA = {
            maxFeePerGas: ethers.utils.parseUnits('1100', 'gwei'),
            maxPriorityFeePerGas: ethers.utils.parseUnits('1100', 'gwei'),
        };
        currentProvider.getFeeData = async () => FEE_DATA;

        let deployer = new ethers.Wallet(deployerPvtKeyRollup1, currentProvider);
        const PolygonZkEVMBridgeV2Factory = await ethers.getContractFactory('PolygonZkEVMBridge', deployer);
        const PolygonZkEVMBridgeV2Contract = PolygonZkEVMBridgeV2Factory.attach(polygonZkEVMBridgeAddressRollup1);

        const proxyAdminFactory = await ethers.getContractFactory('ProxyAdmin', deployer);
        const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddressRollup1);
        console.log(proxyAdminInstance.address)

        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
        const timelockContract = timelockContractFactory.attach(timelockContractAddressRollup1);

        const PolygonZkEVMBridgeFactoryImpl = await ethers.getContractFactory('PolygonZkEVMBridge', deployer);
        const newImpl = await PolygonZkEVMBridgeFactoryImpl.deploy();
        await newImpl.deployed();
        console.log(newImpl.address)

        const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVM', deployer);
        const PolygonZkEVMContract = PolygonZkEVMFactory.attach(polygonZkEVMAddressRollup1);
        let last = await PolygonZkEVMContract.lastVerifiedBatch();
        console.log("last:"+last);
        await PolygonZkEVMContract.deactivateEmergencyState();
        let tx = await PolygonZkEVMContract.activateEmergencyState(last);
        console.log(await tx.wait(1))

        const upgradeallAdmin = proxyAdminFactory.interface.encodeFunctionData('upgrade', [PolygonZkEVMBridgeV2Contract.address, newImpl.address]);
        console.log(upgradeallAdmin)
        tx = await timelockContract.schedule(proxyAdminInstance.address,0,upgradeallAdmin,"0x0000000000000000000000000000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000000000000000000000000000", 0);
        console.log(await tx.wait(1));
        console.log(await timelockContract.execute(proxyAdminInstance.address,0,upgradeallAdmin,"0x0000000000000000000000000000000000000000000000000000000000000000","0x0000000000000000000000000000000000000000000000000000000000000000"));

        await PolygonZkEVMContract.deactivateEmergencyState()
    }).timeout(1000000);

    // npx hardhat test test/upgrade.test.js --network opsideDevnet --grep "2.upgrade rollup2 L1"
    it("2.upgrade rollup2 L1", async function () {
        let currentProvider = new ethers.providers.FallbackProvider([ethers.provider], 1);

        const FEE_DATA = {
            maxFeePerGas: ethers.utils.parseUnits('1100', 'gwei'),
            maxPriorityFeePerGas: ethers.utils.parseUnits('1100', 'gwei'),
        };
        currentProvider.getFeeData = async () => FEE_DATA;

        let deployer = new ethers.Wallet(deployerPvtKeyRollup2, currentProvider);
        const PolygonZkEVMBridgeV2Factory = await ethers.getContractFactory('PolygonZkEVMBridge', deployer);
        const PolygonZkEVMBridgeV2Contract = PolygonZkEVMBridgeV2Factory.attach(polygonZkEVMBridgeAddressRollup2);

        const proxyAdminFactory = await ethers.getContractFactory('ProxyAdmin', deployer);
        const proxyAdminInstance = proxyAdminFactory.attach(proxyAdminAddressRollup2);
        console.log(proxyAdminInstance.address)

        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
        const timelockContract = timelockContractFactory.attach(timelockContractAddressRollup2);

        const PolygonZkEVMBridgeFactoryImpl = await ethers.getContractFactory('PolygonZkEVMBridge', deployer);
        const newImpl = await PolygonZkEVMBridgeFactoryImpl.deploy();
        await newImpl.deployed();
        console.log(newImpl.address)

        const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVM', deployer);
        const PolygonZkEVMContract = PolygonZkEVMFactory.attach(polygonZkEVMAddressRollup2);
        let last = await PolygonZkEVMContract.lastVerifiedBatch();
        console.log("last:"+last);
        await PolygonZkEVMContract.deactivateEmergencyState();
        let tx = await PolygonZkEVMContract.activateEmergencyState(last);
        console.log(await tx.wait(1))

        const upgradeallAdmin = proxyAdminFactory.interface.encodeFunctionData('upgrade', [PolygonZkEVMBridgeV2Contract.address, newImpl.address]);
        console.log(upgradeallAdmin)
        tx = await timelockContract.schedule(proxyAdminInstance.address,0,upgradeallAdmin,"0x0000000000000000000000000000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000000000000000000000000000", 0);
        console.log(await tx.wait(1));
        console.log(await timelockContract.execute(proxyAdminInstance.address,0,upgradeallAdmin,"0x0000000000000000000000000000000000000000000000000000000000000000","0x0000000000000000000000000000000000000000000000000000000000000000"));

        await PolygonZkEVMContract.deactivateEmergencyState()
    }).timeout(1000000);
});