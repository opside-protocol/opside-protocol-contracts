/* eslint-disable no-plusplus, no-await-in-loop */
const { time, loadFixture }  = require('@nomicfoundation/hardhat-network-helpers');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');


describe('Contract', () => {
    let name = "rollup-dex";
    let opsideSlotsContract;
    let globalRewardDistributionContract;
    let openRegistrarContract;
    let globalRewardPoolContract;
    let slotAdapterContract;
    let slotAdapterContract2;
    let slotAdapterContract3;
    let slotAdapterContract4;
    let deployer;
    let deployerAdapter;
    let admin;
    let admin2;
    let admin3;
    let transferOwnership;
    let receiveAddress;
    let receiveAddress2;
    let wideContract;

    before('Deploy contract', async () => {
        upgrades.silenceWarnings();
        // load signers
        [deployer, deployerAdapter, admin, admin2, admin3, transferOwnership, receiveAddress,receiveAddress2] = await ethers.getSigners();

        const erc20Factory = await ethers.getContractFactory("ERC20PermitMock", deployer);

        wideContract = await erc20Factory.deploy('WIDE', 'WIDE', deployerAdapter.address, ethers.utils.parseEther('1000000000000'))

        const globalRewardDistributionFactory = await ethers.getContractFactory("GlobalRewardDistribution", deployer);
        globalRewardDistributionContract = await globalRewardDistributionFactory.deploy();
        await globalRewardDistributionContract.deployed();

        await globalRewardDistributionContract.setRewardPerBlock(ethers.utils.parseEther('6'))

        const nonceOpenRegistrar = Number((await ethers.provider.getTransactionCount(deployer.address))) + 4;
        const nonceGlobalRewardPool = nonceOpenRegistrar + 2;

        let openRegistrarAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceOpenRegistrar });
        let globalRewardPoolAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceGlobalRewardPool });

        console.log(nonceOpenRegistrar, openRegistrarAddress);
        console.log(nonceGlobalRewardPool, globalRewardPoolAddress);

        const opsideSlotsFactory = await ethers.getContractFactory("OpsideSlots", deployer);
        opsideSlotsContract = await upgrades.deployProxy(
            opsideSlotsFactory,
            [
              openRegistrarAddress,
              globalRewardPoolAddress
            ],
            {});


        const openRegistrarFactory = await ethers.getContractFactory("OpenRegistrar", deployer);
        openRegistrarContract = await upgrades.deployProxy(
            openRegistrarFactory,
            [
              opsideSlotsContract.address
            ],
            {
            });


        const globalRewardPoolFactory = await ethers.getContractFactory("GlobalRewardPool", deployer);
        globalRewardPoolContract = await upgrades.deployProxy(
            globalRewardPoolFactory,
            [opsideSlotsContract.address, globalRewardDistributionContract.address],
            {}
          );

        await openRegistrarContract.connect(deployer).setRent(182, ethers.utils.parseEther("1"));

        await opsideSlotsContract.connect(deployer).setIDEToken(wideContract.address);

    });

    it('should check OpsideSlots init', async () => {
        expect(await opsideSlotsContract.openRegistrar()).to.be.equal(openRegistrarContract.address);
        expect(await opsideSlotsContract.globalRewardPool()).to.be.equal(globalRewardPoolContract.address);
    });

    it('should check owner', async () => {
        expect(await opsideSlotsContract.owner()).to.be.equal(deployer.address);
    });

    it('should check transferOwnership', async () => {
        await opsideSlotsContract.connect(deployer).transferOwnership(transferOwnership.address);
        expect(await opsideSlotsContract.owner()).to.be.equal(transferOwnership.address);
    });

    it('should regster slot', async () => {
        await expect(openRegistrarContract.connect(deployerAdapter).request(name, admin.address, 182, 0)).to.be.revertedWith('Need to be allowed');

        await openRegistrarContract.connect(deployer).addRegistrant(deployerAdapter.address);

        await wideContract.connect(deployerAdapter).approve(openRegistrarContract.address, ethers.utils.parseEther("1000"));

        await openRegistrarContract.connect(deployerAdapter).request(name, admin.address, 182, ethers.utils.parseEther("1"));

        const req = await openRegistrarContract.getRequest(1);
        expect(req.value).to.be.equal(ethers.utils.parseEther("1"));
        expect(req.manager).to.be.equal(admin.address);
        expect(req.name).to.be.equal(name);
    });

    it('should accept slot', async () => {
        await expect(openRegistrarContract.connect(deployer).accept(1)).to.emit(openRegistrarContract, 'RegistrationAccepted').withArgs(1,1);
    });

    it('should reject slot', async () => {
        await expect(openRegistrarContract.connect(deployer).reject(1)).to.emit(openRegistrarContract, 'RegistrationRejected').withArgs(1);
    });

    it('should accept slot 2', async () => {
        await openRegistrarContract.connect(deployerAdapter).request(name+'2', admin2.address, 182, ethers.utils.parseEther("1"));
        let req = await openRegistrarContract.getRequest(2);
        expect(req.value).to.be.equal(ethers.utils.parseEther("1"));
        expect(req.manager).to.be.equal(admin2.address);
        expect(req.name).to.be.equal(name+'2');

        await expect(openRegistrarContract.connect(deployer).reject(2)).to.emit(openRegistrarContract, 'RegistrationRejected').withArgs(2);

        await openRegistrarContract.connect(deployerAdapter).request(name+'2', admin2.address, 182, ethers.utils.parseEther("1"));
        req = await openRegistrarContract.getRequest(3);
        expect(req.value).to.be.equal(ethers.utils.parseEther("1"));
        expect(req.manager).to.be.equal(admin2.address);
        expect(req.name).to.be.equal(name+'2');
        await expect(openRegistrarContract.connect(deployer).accept(3)).to.emit(openRegistrarContract, 'RegistrationAccepted').withArgs(3,2);


        await openRegistrarContract.connect(deployerAdapter).request(name+'3', admin2.address, 182, ethers.utils.parseEther("1"));
        req = await openRegistrarContract.getRequest(4);
        expect(req.value).to.be.equal(ethers.utils.parseEther("1"));
        expect(req.manager).to.be.equal(admin2.address);
        expect(req.name).to.be.equal(name+'3');
        await expect(openRegistrarContract.connect(deployer).accept(4)).to.emit(openRegistrarContract, 'RegistrationAccepted').withArgs(4,3);
    });

    it('should check opsideSlot register', async() => {
        await expect(opsideSlotsContract.connect(transferOwnership).register(name+'3', admin2.address, 0)).to.be.rejectedWith('OnlyOpenRegistrar()');
    });

    it('should check opsideSlot setup', async() => {
        const slotAdapterFactory = await ethers.getContractFactory("SlotAdapter", deployer);
        slotAdapterContract = await upgrades.deployProxy(
            slotAdapterFactory,
            [
                admin.address,
                opsideSlotsContract.address,
                globalRewardPoolContract.address,
            ],
            {
                constructorArgs: [],
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            });

        await opsideSlotsContract.connect(transferOwnership).setup(1, 1001, slotAdapterContract.address);

        const slot = await opsideSlotsContract.getSlot(1);

        expect(slot.chainId).to.be.equal(1001);

        const status = await opsideSlotsContract.slotStatus(1);
        expect(status).to.be.equal(1);
    });


    it('should check opsideSlot start', async() => {
        const slotAdapterFactory = await ethers.getContractFactory("SlotAdapter", deployer);
        slotAdapterContract2 = await upgrades.deployProxy(
            slotAdapterFactory,
            [
                admin2.address,
                opsideSlotsContract.address,
                globalRewardPoolContract.address,
            ],
            {
                constructorArgs: [],
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            });

        await opsideSlotsContract.connect(transferOwnership).setup(2, 1002, slotAdapterContract2.address);

        const slotAdapterAddress = await opsideSlotsContract.getSlotAdapter(2);

        expect(slotAdapterAddress).to.be.equal(slotAdapterContract2.address);

        expect(await opsideSlotsContract.getSlotAdapter(3)).to.be.equal('0x0000000000000000000000000000000000000000');

        await opsideSlotsContract.connect(transferOwnership).start(2);

        const status = await opsideSlotsContract.slotStatus(2);
        expect(status).to.be.equal(2);
    });


    it('should check opsideSlot stop', async() => {
        await opsideSlotsContract.connect(transferOwnership).start(1);
        let status = await opsideSlotsContract.slotStatus(1);
        expect(status).to.be.equal(2);

        await opsideSlotsContract.connect(transferOwnership).stop(1);
        status = await opsideSlotsContract.slotStatus(1);
        expect(status).to.be.equal(4);

        await expect(opsideSlotsContract.connect(transferOwnership).start(1)).to.be.rejectedWith("Slot must be in 'Ready' or 'Paused' status");
    });

    it('should check opsideSlot deregister', async() => {
        await expect(opsideSlotsContract.connect(transferOwnership).deregister(1)).to.emit(opsideSlotsContract, 'Deregister').withArgs(1, transferOwnership.address);
        const slot = await opsideSlotsContract.getSlot(1);
        expect(slot.manager).to.be.equal('0x0000000000000000000000000000000000000000');
        await expect(opsideSlotsContract.connect(transferOwnership).start(1)).to.be.rejectedWith("Slot must be in 'Ready' or 'Paused' status");
    });

    it('should check opsideSlot pause', async() => {
        await opsideSlotsContract.connect(transferOwnership).pause(2);

        const status = await opsideSlotsContract.slotStatus(2);
        expect(status).to.be.equal(3);
    });

    it('should check opsideSlot unpause', async() => {
        await opsideSlotsContract.connect(transferOwnership).unpause(2);
        const status = await opsideSlotsContract.slotStatus(2);
        expect(status).to.be.equal(2);
    });

    it('should check opsideSlot fundGlobalRewards', async() => {
        await opsideSlotsContract.connect(deployerAdapter).fundGlobalRewards({ value: 10 });
        expect(await opsideSlotsContract.getGlobalRewards()).to.be.equal(10);
    });


    it('should check adapter distributeRewards', async() => {
        const minerDepositFactory = await ethers.getContractFactory("MinerDeposit", deployer);
        const minerDepositContract  = await upgrades.deployProxy(
            minerDepositFactory,
            [
            ],
            {
                constructorArgs: [],
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            });

        await minerDepositContract.setSlotAdapter(slotAdapterContract2.address);

        const zkEvmContractFactory = await ethers.getContractFactory("ZkEvmContract", deployer);
        const zkEvmContractContract = await zkEvmContractFactory.deploy();
        await zkEvmContractContract.deployed();

        await globalRewardPoolContract.addSlotAdapter(slotAdapterContract2.address);

        await zkEvmContractContract.setSlotAdapter(slotAdapterContract2.address);

        await zkEvmContractContract.setDeposit(minerDepositContract.address);

        await slotAdapterContract2.setZKEvmContract(zkEvmContractContract.address);

        expect(await zkEvmContractContract.slotAdapter()).to.be.equal(slotAdapterContract2.address);

        await wideContract.connect(deployerAdapter).transfer(receiveAddress.address, ethers.utils.parseEther('1000'));
        await wideContract.connect(deployerAdapter).transfer(opsideSlotsContract.address, ethers.utils.parseEther('1000'));
        await wideContract.connect(receiveAddress).approve(minerDepositContract.address, ethers.utils.parseEther('1000'));

        await minerDepositContract.connect(receiveAddress).deposit(ethers.utils.parseEther('100'));


        await opsideSlotsContract.connect(deployerAdapter).fundGlobalRewards({ value: 100000000000000000000n });
        expect(await opsideSlotsContract.getGlobalRewards()).to.be.equal(100000000000000000010n);

        await zkEvmContractContract.sequenceBatches(1);

        await zkEvmContractContract.connect(receiveAddress).submitProofHash(1, 1, "0x0000000000000000000000000000000000000000000000000000000000000000");

        let blockNumber = await slotAdapterContract2.finalNumToBlock(1);
        expect(await opsideSlotsContract.getCommitCount(blockNumber)).to.be.equal(1);

        let balance = await wideContract.balanceOf(receiveAddress.address); // ethers.provider.getBalance(receiveAddress.address);
        balance = balance.add(ethers.utils.parseEther('6'));
        await zkEvmContractContract.distributeRewards(receiveAddress.address, 1, 1);
        expect(await wideContract.balanceOf(receiveAddress.address)).to.be.equal(balance);
        // expect(await ethers.provider.getBalance(receiveAddress.address)).to.be.equal(balance);



        const slotAdapterFactory = await ethers.getContractFactory("SlotAdapter", deployer);
        slotAdapterContract3 = await upgrades.deployProxy(
            slotAdapterFactory,
            [
                admin2.address,
                opsideSlotsContract.address,
                globalRewardPoolContract.address,
            ],
            {
                constructorArgs: [],
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            });

        await opsideSlotsContract.connect(transferOwnership).setup(3, 1003, slotAdapterContract3.address);

        await opsideSlotsContract.connect(transferOwnership).start(3);


        const minerDepositFactory2 = await ethers.getContractFactory("MinerDeposit", deployer);
        const minerDepositContract2  = await upgrades.deployProxy(
            minerDepositFactory2,
            [
            ],
            {
                constructorArgs: [],
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            });

        await minerDepositContract2.setSlotAdapter(slotAdapterContract3.address);

        const zkEvmContractFactory1 = await ethers.getContractFactory("ZkEvmContract", deployer);
        const zkEvmContractContract1 = await zkEvmContractFactory1.deploy();
        await zkEvmContractContract1.deployed();

        await globalRewardPoolContract.addSlotAdapter(slotAdapterContract3.address);

        await zkEvmContractContract1.setSlotAdapter(slotAdapterContract3.address);

        await zkEvmContractContract1.setDeposit(minerDepositContract2.address);

        await slotAdapterContract3.setZKEvmContract(zkEvmContractContract1.address);

        expect(await zkEvmContractContract1.slotAdapter()).to.be.equal(slotAdapterContract3.address);

        await wideContract.connect(receiveAddress).approve(minerDepositContract2.address, ethers.utils.parseEther('1000'));
        await expect(minerDepositContract2.connect(receiveAddress).deposit(ethers.utils.parseEther('100'))).to.be.rejectedWith('invalid deposit');

        await wideContract.connect(deployerAdapter).transfer(receiveAddress2.address, ethers.utils.parseEther('1000'));
        await wideContract.connect(receiveAddress2).approve(minerDepositContract2.address, ethers.utils.parseEther('1000'));
        await minerDepositContract2.connect(receiveAddress2).deposit(ethers.utils.parseEther('100'));

        await hre.network.provider.send('evm_setAutomine', [false]);
        await hre.network.provider.send('evm_setIntervalMining', [0]);

        await zkEvmContractContract1.sequenceBatches(1);
        await zkEvmContractContract.sequenceBatches(2);
        await hre.network.provider.request({
            method: "evm_mine",
        });

        await zkEvmContractContract.connect(receiveAddress).submitProofHash(2, 2, "0x0000000000000000000000000000000000000000000000000000000000000000");
        await hre.network.provider.send('evm_setAutomine', [true]);
        blockNumber = await slotAdapterContract2.finalNumToBlock(2);
        expect(await opsideSlotsContract.getCommitCount(blockNumber)).to.be.equal(2);

        blockNumber = await slotAdapterContract3.finalNumToBlock(1);
        expect(await opsideSlotsContract.getCommitCount(blockNumber)).to.be.equal(2);

        blockNumber = await ethers.provider.getBlockNumber();
        await zkEvmContractContract.distributeRewards(receiveAddress.address, 2, 2);

        let reward = ethers.utils.parseEther('3');

        let events = await slotAdapterContract2.queryFilter('DistributeRewards',blockNumber, blockNumber + 100);
        expect(events[0].args._amount).to.be.equal(reward);




        await openRegistrarContract.connect(deployerAdapter).request(name+'4', admin2.address, 182, ethers.utils.parseEther("1"));
        req = await openRegistrarContract.getRequest(5);
        expect(req.value).to.be.equal(ethers.utils.parseEther("1"));
        expect(req.manager).to.be.equal(admin2.address);
        expect(req.name).to.be.equal(name+'4');
        await expect(openRegistrarContract.connect(deployer).accept(5)).to.emit(openRegistrarContract, 'RegistrationAccepted').withArgs(5,4);


        slotAdapterContract4 = await upgrades.deployProxy(
            slotAdapterFactory,
            [
                admin2.address,
                opsideSlotsContract.address,
                globalRewardPoolContract.address,
            ],
            {
                constructorArgs: [],
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            });

        await opsideSlotsContract.connect(transferOwnership).setup(4, 1004, slotAdapterContract4.address);

        await opsideSlotsContract.connect(transferOwnership).start(4);


        const minerDepositFactory3 = await ethers.getContractFactory("MinerDeposit", deployer);
        const minerDepositContract3  = await upgrades.deployProxy(
            minerDepositFactory3,
            [
            ],
            {
                constructorArgs: [],
                unsafeAllow: ['constructor', 'state-variable-immutable'],
            });

        await minerDepositContract3.setSlotAdapter(slotAdapterContract4.address);

        const zkEvmContractFactory2 = await ethers.getContractFactory("ZkEvmContract", deployer);
        const zkEvmContractContract2 = await zkEvmContractFactory2.deploy();
        await zkEvmContractContract2.deployed();

        await globalRewardPoolContract.addSlotAdapter(slotAdapterContract4.address);

        await zkEvmContractContract2.setSlotAdapter(slotAdapterContract4.address);

        await zkEvmContractContract2.setDeposit(minerDepositContract3.address);

        await slotAdapterContract4.setZKEvmContract(zkEvmContractContract2.address);

        expect(await zkEvmContractContract2.slotAdapter()).to.be.equal(slotAdapterContract4.address);

        await wideContract.connect(receiveAddress).approve(minerDepositContract3.address, ethers.utils.parseEther('1000'));
        await expect(minerDepositContract3.connect(receiveAddress).deposit(ethers.utils.parseEther('100'))).to.be.rejectedWith('invalid deposit');
        await minerDepositContract3.connect(receiveAddress2).withdraw(ethers.utils.parseEther('100'));

        await hre.network.provider.send('evm_setAutomine', [false]);
        await hre.network.provider.send('evm_setIntervalMining', [0]);

        await zkEvmContractContract1.sequenceBatches(2);
        await zkEvmContractContract2.sequenceBatches(1);
        await zkEvmContractContract.sequenceBatches(3);
        await hre.network.provider.request({
            method: "evm_mine",
        });

        await zkEvmContractContract.connect(receiveAddress).submitProofHash(3, 3, "0x0000000000000000000000000000000000000000000000000000000000000000");
        await hre.network.provider.send('evm_setAutomine', [true]);
        blockNumber = await slotAdapterContract2.finalNumToBlock(3);
        expect(await opsideSlotsContract.getCommitCount(blockNumber)).to.be.equal(3);

        blockNumber = await slotAdapterContract3.finalNumToBlock(2);
        expect(await opsideSlotsContract.getCommitCount(blockNumber)).to.be.equal(3);

        blockNumber = await slotAdapterContract4.finalNumToBlock(1);
        expect(await opsideSlotsContract.getCommitCount(blockNumber)).to.be.equal(3);

        blockNumber = await ethers.provider.getBlockNumber();
        await zkEvmContractContract.distributeRewards(receiveAddress.address, 3, 3);

        reward = ethers.utils.parseEther('2');
        events = await slotAdapterContract2.queryFilter('DistributeRewards',blockNumber, blockNumber + 100);
        expect(events[0].args._amount).to.be.equal(reward);

    });

    it('should check add and remove zero gas contract', async() => {
        // await expect(slotAdapterContract.addGasFreeContractBatch([slotAdapterContract.address, admin.address]))
        //     .to.be.revertedWith('only contracts');
        await slotAdapterContract.addGasFreeContractBatch([slotAdapterContract.address, admin.address]);
        expect(await slotAdapterContract.isGasFreeContract(admin.address)).to.be.equal(true)
        expect(await slotAdapterContract.isGasFreeContract(slotAdapterContract.address)).to.be.equal(true)

        await expect(slotAdapterContract.addGasFreeContractBatch([slotAdapterContract.address, slotAdapterContract2.address])).to.be.emit(slotAdapterContract, 'UpdateGasFreeContractBatch' ).withArgs([slotAdapterContract.address, slotAdapterContract2.address], true)
        expect(await slotAdapterContract.isGasFreeContract(slotAdapterContract.address)).to.be.equal(true)
        expect(await slotAdapterContract.isGasFreeContract(slotAdapterContract2.address)).to.be.equal(true)


        await expect(slotAdapterContract.delGasFreeContractBatch([slotAdapterContract.address, admin.address])).to.be.emit(slotAdapterContract, 'UpdateGasFreeContractBatch').withArgs([slotAdapterContract.address, admin.address], false)
        expect(await slotAdapterContract.isGasFreeContract(slotAdapterContract.address)).to.be.equal(false)
        expect(await slotAdapterContract.isGasFreeContract(slotAdapterContract2.address)).to.be.equal(true)
    });

});
