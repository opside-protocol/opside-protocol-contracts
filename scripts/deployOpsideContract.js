/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if, import/no-dynamic-require, global-require */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved, no-restricted-syntax */
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pathOutputJson = path.join(__dirname, './deploy_output.json');
let deployOutputParameters = {};
if (fs.existsSync(pathOutputJson)) {
  deployOutputParameters = require(pathOutputJson);
}

async function main() {
  let currentProvider = new ethers.providers.FallbackProvider([ethers.provider], 1);
  let deployer;
  if (process.env.PRIVATE_KEY && process.env.HARDHAT_NETWORK != 'hardhat') {
    // if (process.env.MAXFEEPERGAS != undefined && process.env.MAXPRIORITYFEEPERGAS != undefined) {
    //   async function overrideFeeData() {
    //     return {
    //       maxFeePerGas: ethers.utils.parseUnits(process.env.MAXFEEPERGAS, 'gwei'),
    //       maxPriorityFeePerGas: ethers.utils.parseUnits(process.env.MAXPRIORITYFEEPERGAS, 'gwei'),
    //     };
    //   }
    //   currentProvider.getFeeData = overrideFeeData;
    // }
    deployer = new ethers.Wallet(process.env.PRIVATE_KEY, currentProvider);
    console.log(await deployer.getAddress())
  } else {
    [deployer] = (await ethers.getSigners());
  }

  const globalRewardDistributionFactory = await ethers.getContractFactory("GlobalRewardDistribution", deployer);
  let globalRewardDistributionContract;
  if (deployOutputParameters.globalRewardDistributionAddress === undefined || deployOutputParameters.globalRewardDistributionAddress === '') {
    globalRewardDistributionContract = await globalRewardDistributionFactory.deploy();
    await globalRewardDistributionContract.deployed();
  } else {
    globalRewardDistributionContract = globalRewardDistributionFactory.attach(deployOutputParameters.globalRewardDistributionAddress);
  }
  
  console.log('#######################\n');
  console.log('GlobalRewardDistribution deployed to:', globalRewardDistributionContract.address);
  let outputJson = deployOutputParameters;
  outputJson.globalRewardDistributionAddress = globalRewardDistributionContract.address;
  

  fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));

  // const IDEDepositFactory = await ethers.getContractFactory("IDEDeposit", deployer);
  // let IDEDepositContract;
  // if (deployOutputParameters.IDEDepositAddress === undefined || deployOutputParameters.IDEDepositAddress === '')  {
  //   IDEDepositContract = await upgrades.deployProxy(IDEDepositFactory, [], {});
  // } else {
  //   IDEDepositContract = IDEDepositFactory.attach(deployOutputParameters.IDEDepositAddress);

  //   await upgrades.forceImport(deployOutputParameters.IDEDepositAddress, IDEDepositFactory, 'transparent');
  // }

  // console.log('#######################\n');
  // console.log('IDEDeposit deployed to:', IDEDepositContract.address);

  // outputJson.IDEDepositAddress = IDEDepositContract.address;
  // fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));


  const opsideSlotsFactory = await ethers.getContractFactory("OpsideSlots", deployer);
  let opsideSlotsContract;
  if (deployOutputParameters.opsideSlotsAddress === undefined || deployOutputParameters.opsideSlotsAddress === '')  {
    opsideSlotsContract = await upgrades.deployProxy(opsideSlotsFactory, [], {initializer : false,});
  } else {
    opsideSlotsContract = opsideSlotsFactory.attach(deployOutputParameters.opsideSlotsAddress);

    await upgrades.forceImport(deployOutputParameters.opsideSlotsAddress, opsideSlotsFactory, 'transparent');
  }

  console.log('#######################\n');
  console.log('OpsideSlots deployed to:', opsideSlotsContract.address);

  outputJson.opsideSlotsAddress = opsideSlotsContract.address;
  fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));


  const openRegistrarFactory = await ethers.getContractFactory("OpenRegistrar", deployer);
  let openRegistrarContract;
  if (deployOutputParameters.openRegistrarAddress === undefined || deployOutputParameters.openRegistrarAddress === '')  {
    // openRegistrarContract = await upgrades.deployProxy(openRegistrarFactory,[], { initializer: false });
    openRegistrarContract = await upgrades.deployProxy(
      openRegistrarFactory, 
      [
        opsideSlotsContract.address
      ], 
      {
      });

  } else {
    openRegistrarContract = openRegistrarFactory.attach(deployOutputParameters.openRegistrarAddress);

    await upgrades.forceImport(deployOutputParameters.openRegistrarAddress, openRegistrarFactory, 'transparent');
  }

  console.log('#######################\n');
  console.log('OpenRegistrar deployed to:', openRegistrarContract.address);

  outputJson.openRegistrarAddress = openRegistrarContract.address;
  fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
  
  const globalRewardPoolFactory = await ethers.getContractFactory("GlobalRewardPool", deployer);
  let globalRewardPoolContract;
  if (deployOutputParameters.globalRewardPoolAddress === undefined || deployOutputParameters.globalRewardPoolAddress === '') {
    // globalRewardPoolContract = await globalRewardPoolFactory.deploy();
    // await globalRewardPoolContract.deployed();

    // opsideSlotsContract.initialize(openRegistrarContract.address, globalRewardPoolContract.address);
    // globalRewardPoolContract.initialize(opsideSlotsContract.address, globalRewardDistributionContract.address);
    globalRewardPoolContract = await upgrades.deployProxy(
      globalRewardPoolFactory,
      [opsideSlotsContract.address, globalRewardDistributionContract.address],
      {}
    );

    await opsideSlotsContract.initialize(openRegistrarContract.address, globalRewardPoolContract.address);
  } else {
    globalRewardPoolContract = globalRewardPoolFactory.attach(deployOutputParameters.globalRewardPoolAddress);

    await upgrades.forceImport(deployOutputParameters.globalRewardPoolAddress, globalRewardPoolFactory, 'transparent');
  }

  console.log('#######################\n');
  console.log('GlobalRewardPool deployed to:', globalRewardPoolContract.address);

  outputJson.globalRewardPoolAddress = globalRewardPoolContract.address;
  console.log(outputJson)
  fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
