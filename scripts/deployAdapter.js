
const { ethers } = require('hardhat');

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pathOutputJson = path.join(__dirname, './deploy_output.json');
let deployOutputParameters = {};
if (!fs.existsSync(pathOutputJson)) {
  throw new Error(`Missing file: ${pathOutputJson}`);
}

deployOutputParameters = require(pathOutputJson);

async function main() {
    let currentProvider = new ethers.providers.FallbackProvider([ethers.provider], 1);
    let deployer;
    if (process.env.PRIVATE_KEY && process.env.HARDHAT_NETWORK != 'hardhat') {
      if (process.env.MAXFEEPERGAS != undefined && process.env.MAXPRIORITYFEEPERGAS != undefined) {
        async function overrideFeeData() {
          return {
            maxFeePerGas: ethers.utils.parseUnits(process.env.MAXFEEPERGAS, 'gwei'),
            maxPriorityFeePerGas: ethers.utils.parseUnits(process.env.MAXPRIORITYFEEPERGAS, 'gwei'),
          };
        }
        currentProvider.getFeeData = overrideFeeData;
      }
      deployer = new ethers.Wallet(process.env.PRIVATE_KEY, currentProvider);
      console.log(await deployer.getAddress())
    } else {
      [deployer] = (await ethers.getSigners());
    }

    const slotAdapterFactory = await ethers.getContractFactory("SlotAdapter", deployer);
    // const slotAdapterContract = await slotAdapterFactory.deploy(process.env.ADAPTER_ADMIN_MANAGER);
    // await slotAdapterContract.deployed();
    const slotAdapterContract = await upgrades.deployProxy(
        slotAdapterFactory, 
        [
            process.env.ADAPTER_ADMIN_MANAGER,
            deployOutputParameters.opsideSlotsAddress,
            deployOutputParameters.globalRewardPoolAddress,
            '0',
        ], 
        {
            constructorArgs: [],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

    console.log('#######################\n');
    console.log('SlotAdapter deployed to:', slotAdapterContract.address);

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });