/* eslint-disable no-plusplus, no-await-in-loop */
const { expect } = require('chai');
const hre = require('hardhat');
const { ethers, upgrades } = require('hardhat');


describe('ZK-EVM-CONTRACT', () => {
    let deployer;
    let trustedSequencer;
    let trustedAggregator;
    let admin;
    let aggregator1;
    let aggregator2;
    let aggregator3;
    let aggregator4;
    let verifierContract;
    let polygonZkEVMBridgeContract;
    let ZkEVMContract;
    let maticTokenContract;
    let polygonZkEVMGlobalExitRoot;
    let slotAdapterContract;
    let depositContract;
    let opsideSlotsContract;
    let globalRewardDistributionContract;
    let openRegistrarContract;
    let globalRewardPoolContract;

    const genesisRoot = '0x0000000000000000000000000000000000000000000000000000000000000001';

    const networkIDMainnet = 0;
    const urlSequencer = 'http://zkevm-json-rpc:8123';
    const chainID = 1000;
    const networkName = 'zkevm';
    const version = '0.0.1';
    const forkID = 0;
    const pendingStateTimeoutDefault = 100;
    const trustedAggregatorTimeoutDefault = 10;
    let firstDeployment = true;

    //Constants
    const FORCE_BATCH_TIMEOUT = 60 * 60 * 24 * 5; // 5 days
    const MAX_BATCH_MULTIPLIER = 12;
    const HALT_AGGREGATION_TIMEOUT = 60 * 60 * 24 * 7; // 7 days
    const _MAX_VERIFY_BATCHES = 1000;
    const NoProofPunishAmount = ethers.utils.parseEther('1');
    const IncorrectProofPunishAmount = ethers.utils.parseEther('10');
    let chainId = 1100;
    beforeEach('Deploy contract', async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedSequencer, trustedAggregator, admin, aggregator1, aggregator2, aggregator3, aggregator4] = await ethers.getSigners();


        const globalRewardDistributionFactory = await ethers.getContractFactory("GlobalRewardDistribution", deployer);
        globalRewardDistributionContract = await globalRewardDistributionFactory.deploy();
        await globalRewardDistributionContract.deployed();


        const opsideSlotsFactory = await ethers.getContractFactory("OpsideSlots", deployer);
        opsideSlotsContract = await upgrades.deployProxy(
            opsideSlotsFactory,
            [
            ],
            { initializer: false} );

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

        await opsideSlotsContract.initialize(openRegistrarContract.address, globalRewardPoolContract.address);

        const SlotAdapterFactory = await ethers.getContractFactory('SlotAdapter');

        const depositFactory = await ethers.getContractFactory('MinerDeposit');

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory(
            'VerifierRollupHelperMock',
        );
        verifierContract = await VerifierRollupHelperFactory.deploy();

        /*
         * deploy global exit root manager
         * In order to not have trouble with nonce deploy first proxy admin
         */
        await upgrades.deployProxyAdmin();
        if ((await upgrades.admin.getInstance()).address !== '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0') {
            firstDeployment = false;
        }
        const nonceProxyBridge = Number((await ethers.provider.getTransactionCount(deployer.address))) + (firstDeployment ? 3 : 2);
        const nonceProxyZkevm = nonceProxyBridge + 2; // Always have to redeploy impl since the polygonZkEVMGlobalExitRoot address changes

        const precalculateBridgeAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyBridge });
        const precalculateZkevmAddress = ethers.utils.getContractAddress({ from: deployer.address, nonce: nonceProxyZkevm });
        firstDeployment = false;

        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot');
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            initializer: false,
            constructorArgs: [precalculateZkevmAddress, precalculateBridgeAddress],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        // deploy PolygonZkEVMBridge
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridge');
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], { initializer: false });

        // deploy PolygonZkEVMMock
        const PolygonZkEVMFactory = await ethers.getContractFactory('PolygonZkEVM');
        ZkEVMContract = await upgrades.deployProxy(PolygonZkEVMFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.address,
                verifierContract.address,
                polygonZkEVMBridgeContract.address,
                chainID,
                forkID,
            ],
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });

        expect(precalculateBridgeAddress).to.be.equal(polygonZkEVMBridgeContract.address);
        expect(precalculateZkevmAddress).to.be.equal(ZkEVMContract.address);

        await polygonZkEVMBridgeContract.initialize(networkIDMainnet, polygonZkEVMGlobalExitRoot.address, ZkEVMContract.address, admin.address, 12);
        await ZkEVMContract.initialize(
            {
                admin: admin.address,
                trustedSequencer: trustedSequencer.address,
                pendingStateTimeout: pendingStateTimeoutDefault,
                trustedAggregator: trustedAggregator.address,
                trustedAggregatorTimeout: trustedAggregatorTimeoutDefault,
            },
            genesisRoot,
            urlSequencer,
            networkName,
            version,
        );

        depositContract = await upgrades.deployProxy(depositFactory, [], {});
        slotAdapterContract = await upgrades.deployProxy(SlotAdapterFactory, [], {
            initializer: false,
            constructorArgs: [],
            unsafeAllow: ['constructor', 'state-variable-immutable'],});

        await slotAdapterContract.initialize(admin.address, opsideSlotsContract.address, globalRewardPoolContract.address);

        await slotAdapterContract.setZKEvmContract(ZkEVMContract.address);

        await ZkEVMContract.connect(admin).setSlotAdapter(slotAdapterContract.address);

        await ZkEVMContract.connect(admin).setDeposit(depositContract.address);

        await ZkEVMContract.connect(admin).setMinDeposit(ethers.utils.parseEther('100'));

        await ZkEVMContract.connect(admin).setNoProofPunishAmount(NoProofPunishAmount);

        await ZkEVMContract.connect(admin).setIncorrectProofPunishAmount(IncorrectProofPunishAmount);

        await  openRegistrarContract.connect(deployer).setRent(182, ethers.utils.parseEther('100'));
        await  openRegistrarContract.connect(deployer).addRegistrant(admin.address);
        await depositContract.connect(deployer).setSlotAdapter(slotAdapterContract.address);


        await openRegistrarContract.connect(admin).request('test', admin.address, 182, {value: ethers.utils.parseEther('100')});

        const regId = await openRegistrarContract.regId();

        await openRegistrarContract.connect(deployer).accept(regId);

        const slotId = await opsideSlotsContract.slotId();

        chainId = chainId + 1;
        await opsideSlotsContract.connect(deployer).setup(slotId, chainId, slotAdapterContract.address);
        await opsideSlotsContract.connect(deployer).start(slotId);

        await depositContract.connect(aggregator1).deposit({value: ethers.utils.parseEther('200')});

        await depositContract.connect(aggregator2).deposit({value: ethers.utils.parseEther('200')});

        await depositContract.connect(aggregator3).deposit({value: ethers.utils.parseEther('200')});
    });

    it('one aggregator: commit two proof hashes and submit two proofs', async () => {
        const l2txData = '0x123456';
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };
        
        const lastBatchSequenced = await ZkEVMContract.lastBatchSequenced();
        
        // Sequence Batches
        await expect(ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address))
        .to.emit(ZkEVMContract, 'SequenceBatches')
        .withArgs(lastBatchSequenced.add(1));

        await expect(ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence, sequence], trustedSequencer.address))
            .to.emit(ZkEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced.add(3));

        // trustedAggregator forge the batch
        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000002';
        
        let numBatch = (await ZkEVMContract.lastVerifiedBatch()).add(1);

        const zkProofFFlonk = '0x20227cbcef731b6cbdc0edd5850c63dc7fbc27fb58d12cd4d08298799cf66a0512c230867d3375a1f4669e7267dad2c31ebcddbaccea6abd67798ceae35ae7611c665b6069339e6812d015e239594aa71c4e217288e374448c358f6459e057c91ad2ef514570b5dea21508e214430daadabdd23433820000fe98b1c6fa81d5c512b86fbf87bd7102775f8ef1da7e8014dc7aab225503237c7927c032e589e9a01a0eab9fda82ffe834c2a4977f36cc9bcb1f2327bdac5fb48ffbeb9656efcdf70d2656c328903e9fb96e4e3f470c447b3053cc68d68cf0ad317fe10aa7f254222e47ea07f3c1c3aacb74e5926a67262f261c1ed3120576ab877b49a81fb8aac51431858662af6b1a8138a44e9d0812d032340369459ccc98b109347cc874c7202dceecc3dbb09d7f9e5658f1ca3a92d22be1fa28f9945205d853e2c866d9b649301ac9857b07b92e4865283d3d5e2b711ea5f85cb2da71965382ece050508d3d008bbe4df5458f70bd3e1bfcc50b34222b43cd28cbe39a3bab6e464664a742161df99c607638e415ced49d0cd719518539ed5f561f81d07fe40d3ce85508e0332465313e60ad9ae271d580022ffca4fbe4d72d38d18e7a6e20d020a1d1e5a8f411291ab95521386fa538ddfe6a391d4a3669cc64c40f07895f031550b32f7d73205a69c214a8ef3cdf996c495e3fd24c00873f30ea6b2bfabfd38de1c3da357d1fefe203573fdad22f675cb5cfabbec0a041b1b31274f70193da8e90cfc4d6dc054c7cd26d09c1dadd064ec52b6ddcfa0cb144d65d9e131c0c88f8004f90d363034d839aa7760167b5302c36d2c2f6714b41782070b10c51c178bd923182d28502f36e19b079b190008c46d19c399331fd60b6b6bde898bd1dd0a71ee7ec7ff7124cc3d374846614389e7b5975b77c4059bc42b810673dbb6f8b951e5b636bdf24afd2a3cbe96ce8600e8a79731b4a56c697596e0bff7b73f413bdbc75069b002b00d713fae8d6450428246f1b794d56717050fdb77bbe094ac2ee6af54a153e2fb8ce1d31a86c4fdd523783b910bedf7db58a46ba6ce48ac3ca194f3cf2275e';

        let blockNumber = await ethers.provider.getBlockNumber();

        let proofhash = ethers.utils.solidityKeccak256(['bytes', 'address'], [ethers.utils.keccak256(zkProofFFlonk), aggregator1.address]);

        await expect(ZkEVMContract.connect(aggregator1).submitProofHash(numBatch.sub(1), numBatch, proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').withArgs(aggregator1.address, numBatch.sub(1), numBatch, proofhash);

        await expect(ZkEVMContract.connect(aggregator1).submitProofHash(numBatch, numBatch.add(2), proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').withArgs(aggregator1.address, numBatch, numBatch.add(2), proofhash);

        const sequencedBatch = await ZkEVMContract.sequencedBatches(numBatch);
        expect(sequencedBatch.blockNumber).to.be.equal(blockNumber + 1);
        // revert
        // await ZkEVMContract.connect(aggregator1).verifyBatches(numBatch - 1, numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk);
        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.be.revertedWithCustomError(ZkEVMContract, 'SubmitProofEarly');
        for (let i = 0; i < 20 - 1; i++ ) {
            await hre.network.provider.request({
                method: "evm_mine",
            });
        }
        // await ZkEVMContract.connect(aggregator1).verifyBatches(numBatch - 1, numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk);
        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.emit(ZkEVMContract, 'VerifyBatchesTrustedAggregator').withArgs(numBatch, newStateRoot, aggregator1.address);
        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch, numBatch.add(2), newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.emit(ZkEVMContract, 'VerifyBatchesTrustedAggregator').withArgs(numBatch.add(2), newStateRoot, aggregator1.address);
    });

    it('one aggregator: no proof, and normal submission after proof submission window', async () => {
        const l2txData = '0x123456';
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        const lastBatchSequenced = await ZkEVMContract.lastBatchSequenced();

        await ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address);
        await expect(ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address))
        .to.emit(ZkEVMContract, 'SequenceBatches')
        .withArgs(lastBatchSequenced.add(2));


        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';

        let numBatch = (await ZkEVMContract.lastVerifiedBatch()).add(1);
        const zkProofFFlonk = '0x20227cbcef731b6cbdc0edd5850c63dc7fbc27fb58d12cd4d08298799cf66a0512c230867d3375a1f4669e7267dad2c31ebcddbaccea6abd67798ceae35ae7611c665b6069339e6812d015e239594aa71c4e217288e374448c358f6459e057c91ad2ef514570b5dea21508e214430daadabdd23433820000fe98b1c6fa81d5c512b86fbf87bd7102775f8ef1da7e8014dc7aab225503237c7927c032e589e9a01a0eab9fda82ffe834c2a4977f36cc9bcb1f2327bdac5fb48ffbeb9656efcdf70d2656c328903e9fb96e4e3f470c447b3053cc68d68cf0ad317fe10aa7f254222e47ea07f3c1c3aacb74e5926a67262f261c1ed3120576ab877b49a81fb8aac51431858662af6b1a8138a44e9d0812d032340369459ccc98b109347cc874c7202dceecc3dbb09d7f9e5658f1ca3a92d22be1fa28f9945205d853e2c866d9b649301ac9857b07b92e4865283d3d5e2b711ea5f85cb2da71965382ece050508d3d008bbe4df5458f70bd3e1bfcc50b34222b43cd28cbe39a3bab6e464664a742161df99c607638e415ced49d0cd719518539ed5f561f81d07fe40d3ce85508e0332465313e60ad9ae271d580022ffca4fbe4d72d38d18e7a6e20d020a1d1e5a8f411291ab95521386fa538ddfe6a391d4a3669cc64c40f07895f031550b32f7d73205a69c214a8ef3cdf996c495e3fd24c00873f30ea6b2bfabfd38de1c3da357d1fefe203573fdad22f675cb5cfabbec0a041b1b31274f70193da8e90cfc4d6dc054c7cd26d09c1dadd064ec52b6ddcfa0cb144d65d9e131c0c88f8004f90d363034d839aa7760167b5302c36d2c2f6714b41782070b10c51c178bd923182d28502f36e19b079b190008c46d19c399331fd60b6b6bde898bd1dd0a71ee7ec7ff7124cc3d374846614389e7b5975b77c4059bc42b810673dbb6f8b951e5b636bdf24afd2a3cbe96ce8600e8a79731b4a56c697596e0bff7b73f413bdbc75069b002b00d713fae8d6450428246f1b794d56717050fdb77bbe094ac2ee6af54a153e2fb8ce1d31a86c4fdd523783b910bedf7db58a46ba6ce48ac3ca194f3cf2275e';

        let blockNumber = await ethers.provider.getBlockNumber();

        let proofhash = ethers.utils.solidityKeccak256(['bytes', 'address'], [ethers.utils.keccak256(zkProofFFlonk), aggregator1.address]);

        await expect(ZkEVMContract.connect(aggregator1).submitProofHash(numBatch.sub(1), numBatch, proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').withArgs(aggregator1.address, numBatch.sub(1), numBatch, proofhash);

        const sequencedBatch = await ZkEVMContract.sequencedBatches(numBatch);
        expect(sequencedBatch.blockNumber).to.be.equal(blockNumber + 1);

        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.be.revertedWithCustomError(ZkEVMContract, 'SubmitProofEarly');

        for (let i = 0; i < 20 + 32 - 1; i++ ) {
            await hre.network.provider.request({
                method: "evm_mine",
            });
        }
        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.be.revertedWithCustomError(ZkEVMContract, 'SubmitProofTooLate');
        let punishAmounts = await depositContract.punishAmounts(aggregator1.address);
        expect(punishAmounts.expect).to.be.equal(0);

        let proverLiquidation = await ZkEVMContract.proverLiquidation(aggregator1.address, 0);
        expect(proverLiquidation.isLiquidated).to.be.equal(false);

        await expect(ZkEVMContract.connect(aggregator1).submitProofHash(numBatch.sub(1), numBatch, proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').withArgs(aggregator1.address, numBatch.sub(1), numBatch, proofhash);

        proverLiquidation = await ZkEVMContract.proverLiquidation(aggregator1.address, 0);
        expect(proverLiquidation.isLiquidated).to.be.equal(true);
        punishAmounts = await depositContract.punishAmounts(aggregator1.address);

        expect(punishAmounts.expect).to.be.equal(NoProofPunishAmount);

        expect(await ZkEVMContract.proverLastLiquidated(aggregator1.address)).to.be.equal(1);


        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.be.revertedWithCustomError(ZkEVMContract, 'SubmitProofEarly');

        for (let i = 0; i < 20 - 1; i++ ) {
            await hre.network.provider.request({
                method: "evm_mine",
            });
        }

        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.emit(ZkEVMContract, 'VerifyBatchesTrustedAggregator').withArgs(numBatch, newStateRoot, aggregator1.address);
    });

    it('one aggregator: no proof  reward and punish', async () => {

        const l2txData = '0x123456';
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        const lastBatchSequenced = await ZkEVMContract.lastBatchSequenced();

        await ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address);
        await expect(ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address))
            .to.emit(ZkEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced.add(2));


        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';

        let numBatch = (await ZkEVMContract.lastVerifiedBatch()).add(1);
        const zkProofFFlonk = '0x20227cbcef731b6cbdc0edd5850c63dc7fbc27fb58d12cd4d08298799cf66a0512c230867d3375a1f4669e7267dad2c31ebcddbaccea6abd67798ceae35ae7611c665b6069339e6812d015e239594aa71c4e217288e374448c358f6459e057c91ad2ef514570b5dea21508e214430daadabdd23433820000fe98b1c6fa81d5c512b86fbf87bd7102775f8ef1da7e8014dc7aab225503237c7927c032e589e9a01a0eab9fda82ffe834c2a4977f36cc9bcb1f2327bdac5fb48ffbeb9656efcdf70d2656c328903e9fb96e4e3f470c447b3053cc68d68cf0ad317fe10aa7f254222e47ea07f3c1c3aacb74e5926a67262f261c1ed3120576ab877b49a81fb8aac51431858662af6b1a8138a44e9d0812d032340369459ccc98b109347cc874c7202dceecc3dbb09d7f9e5658f1ca3a92d22be1fa28f9945205d853e2c866d9b649301ac9857b07b92e4865283d3d5e2b711ea5f85cb2da71965382ece050508d3d008bbe4df5458f70bd3e1bfcc50b34222b43cd28cbe39a3bab6e464664a742161df99c607638e415ced49d0cd719518539ed5f561f81d07fe40d3ce85508e0332465313e60ad9ae271d580022ffca4fbe4d72d38d18e7a6e20d020a1d1e5a8f411291ab95521386fa538ddfe6a391d4a3669cc64c40f07895f031550b32f7d73205a69c214a8ef3cdf996c495e3fd24c00873f30ea6b2bfabfd38de1c3da357d1fefe203573fdad22f675cb5cfabbec0a041b1b31274f70193da8e90cfc4d6dc054c7cd26d09c1dadd064ec52b6ddcfa0cb144d65d9e131c0c88f8004f90d363034d839aa7760167b5302c36d2c2f6714b41782070b10c51c178bd923182d28502f36e19b079b190008c46d19c399331fd60b6b6bde898bd1dd0a71ee7ec7ff7124cc3d374846614389e7b5975b77c4059bc42b810673dbb6f8b951e5b636bdf24afd2a3cbe96ce8600e8a79731b4a56c697596e0bff7b73f413bdbc75069b002b00d713fae8d6450428246f1b794d56717050fdb77bbe094ac2ee6af54a153e2fb8ce1d31a86c4fdd523783b910bedf7db58a46ba6ce48ac3ca194f3cf2275e';

        let blockNumber = await ethers.provider.getBlockNumber();

        let proofhash = ethers.utils.solidityKeccak256(['bytes', 'address'], [ethers.utils.keccak256(zkProofFFlonk), aggregator1.address]);

        await expect(ZkEVMContract.connect(aggregator1).submitProofHash(numBatch.sub(1), numBatch, proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').withArgs(aggregator1.address, numBatch.sub(1), numBatch, proofhash);

        // console.log("deployer's proverLiquidation  proofhash ",await  ZkEVMContract.connect(aggregator1).proverLiquidation(aggregator1.address,0));


        const sequencedBatch = await ZkEVMContract.sequencedBatches(numBatch);
        expect(sequencedBatch.blockNumber).to.be.equal(blockNumber + 1);

        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.be.revertedWithCustomError(ZkEVMContract, 'SubmitProofEarly');

        for (let i = 0; i < 20 + 32 - 1; i++ ) {
            await hre.network.provider.request({
                method: "evm_mine",
            });
        }
        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.be.revertedWithCustomError(ZkEVMContract, 'SubmitProofTooLate');
        let punishAmounts = await depositContract.punishAmounts(aggregator1.address);
        expect(punishAmounts.expect).to.be.equal(0);

        let proverLiquidation = await ZkEVMContract.proverLiquidation(aggregator1.address, 0);
        expect(proverLiquidation.isLiquidated).to.be.equal(false);

        let punishBefore = await depositContract.connect(aggregator1).depositAmounts(aggregator1.address);

        await expect(ZkEVMContract.connect(aggregator1).submitProofHash(numBatch.sub(1), numBatch, proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').withArgs(aggregator1.address, numBatch.sub(1), numBatch, proofhash);

        let punishEnd = await depositContract.connect(aggregator1).depositAmounts(aggregator1.address);

        expect(punishBefore - punishEnd > 0 ).to.be.equal(true);

        // console.log("punishment record :",await depositContract.connect(aggregator1).punishAmounts(aggregator1.address).expect);

        proverLiquidation = await ZkEVMContract.proverLiquidation(aggregator1.address, 0);
        expect(proverLiquidation.isLiquidated).to.be.equal(true);
        punishAmounts = await depositContract.punishAmounts(aggregator1.address);

        expect(punishAmounts.expect).to.be.equal(NoProofPunishAmount);

        expect(await ZkEVMContract.proverLastLiquidated(aggregator1.address)).to.be.equal(1);


        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.be.revertedWithCustomError(ZkEVMContract, 'SubmitProofEarly');

        for (let i = 0; i < 20 - 1; i++ ) {
            await hre.network.provider.request({
                method: "evm_mine",
            });
        }

        let balance_beforeVerifyBatches = await  ethers.provider.getBalance(aggregator1.address);

        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.emit(ZkEVMContract, 'VerifyBatchesTrustedAggregator').withArgs(numBatch, newStateRoot, aggregator1.address);

        let balance_endVerifyBatches = await  ethers.provider.getBalance(aggregator1.address);

        expect(balance_endVerifyBatches).greaterThan(balance_beforeVerifyBatches);


    });

    it('two aggregators: one prover submit proof, reward and punish', async () => {

        const l2txData = '0x123456';
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        const lastBatchSequenced = await ZkEVMContract.lastBatchSequenced();

        await ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address);
        await expect(ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address))
            .to.emit(ZkEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced.add(2));

        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';

        let numBatch = (await ZkEVMContract.lastVerifiedBatch()).add(1);
        const zkProofFFlonk = '0x20227cbcef731b6cbdc0edd5850c63dc7fbc27fb58d12cd4d08298799cf66a0512c230867d3375a1f4669e7267dad2c31ebcddbaccea6abd67798ceae35ae7611c665b6069339e6812d015e239594aa71c4e217288e374448c358f6459e057c91ad2ef514570b5dea21508e214430daadabdd23433820000fe98b1c6fa81d5c512b86fbf87bd7102775f8ef1da7e8014dc7aab225503237c7927c032e589e9a01a0eab9fda82ffe834c2a4977f36cc9bcb1f2327bdac5fb48ffbeb9656efcdf70d2656c328903e9fb96e4e3f470c447b3053cc68d68cf0ad317fe10aa7f254222e47ea07f3c1c3aacb74e5926a67262f261c1ed3120576ab877b49a81fb8aac51431858662af6b1a8138a44e9d0812d032340369459ccc98b109347cc874c7202dceecc3dbb09d7f9e5658f1ca3a92d22be1fa28f9945205d853e2c866d9b649301ac9857b07b92e4865283d3d5e2b711ea5f85cb2da71965382ece050508d3d008bbe4df5458f70bd3e1bfcc50b34222b43cd28cbe39a3bab6e464664a742161df99c607638e415ced49d0cd719518539ed5f561f81d07fe40d3ce85508e0332465313e60ad9ae271d580022ffca4fbe4d72d38d18e7a6e20d020a1d1e5a8f411291ab95521386fa538ddfe6a391d4a3669cc64c40f07895f031550b32f7d73205a69c214a8ef3cdf996c495e3fd24c00873f30ea6b2bfabfd38de1c3da357d1fefe203573fdad22f675cb5cfabbec0a041b1b31274f70193da8e90cfc4d6dc054c7cd26d09c1dadd064ec52b6ddcfa0cb144d65d9e131c0c88f8004f90d363034d839aa7760167b5302c36d2c2f6714b41782070b10c51c178bd923182d28502f36e19b079b190008c46d19c399331fd60b6b6bde898bd1dd0a71ee7ec7ff7124cc3d374846614389e7b5975b77c4059bc42b810673dbb6f8b951e5b636bdf24afd2a3cbe96ce8600e8a79731b4a56c697596e0bff7b73f413bdbc75069b002b00d713fae8d6450428246f1b794d56717050fdb77bbe094ac2ee6af54a153e2fb8ce1d31a86c4fdd523783b910bedf7db58a46ba6ce48ac3ca194f3cf2275e';

        let blockNumber = await ethers.provider.getBlockNumber();

        let proofhash = ethers.utils.solidityKeccak256(['bytes', 'address'], [ethers.utils.keccak256(zkProofFFlonk), aggregator1.address]);

        let aggregator2proofhash = ethers.utils.solidityKeccak256(['bytes', 'address'], [ethers.utils.keccak256(zkProofFFlonk), aggregator2.address]);

        await expect(ZkEVMContract.connect(aggregator1).submitProofHash(numBatch.sub(1), numBatch, proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').withArgs(aggregator1.address, numBatch.sub(1), numBatch, proofhash);

        await expect(ZkEVMContract.connect(aggregator2).submitProofHash(numBatch.sub(1), numBatch, aggregator2proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').withArgs(aggregator2.address, numBatch.sub(1), numBatch, aggregator2proofhash);

        const sequencedBatch = await ZkEVMContract.sequencedBatches(numBatch);
        expect(sequencedBatch.blockNumber).to.be.equal(blockNumber + 1);


        for (let i = 0; i < 20 - 1; i++ ) {
            await hre.network.provider.request({
                method: "evm_mine",
            });
        }

        // let real_beforeVerifyBatches = await depositContract.connect(aggregator1).punishAmounts(aggregator1.address)

        let balance_beforeVerifyBatches = await  ethers.provider.getBalance(aggregator1.address);

        // await expect(ZkEVMContract.connect(aggregator1).settle(aggregator1.address));

        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.emit(ZkEVMContract, 'VerifyBatchesTrustedAggregator').withArgs(numBatch, newStateRoot, aggregator1.address);

        let balance_endVerifyBatches = await  ethers.provider.getBalance(aggregator1.address);

        expect(balance_endVerifyBatches).greaterThan(balance_beforeVerifyBatches);

        // let real_endVerifyBatches = await depositContract.connect(aggregator1).punishAmounts(aggregator1.address)



        for (let i = 0; i < 20 - 1; i++ ) {
            await hre.network.provider.request({
                method: "evm_mine",
            });
        }

        // let aggregator2_real_beforeVerifyBatches = await depositContract.connect(aggregator2).punishAmounts(aggregator2.address)

        let aggregator2_balance_beforeVerifyBatches = await  ethers.provider.getBalance(aggregator2.address);


        await expect(ZkEVMContract.connect(aggregator2).settle(aggregator2.address));

        // await expect(ZkEVMContract.connect(aggregator2).verifyBatches(numBatch - 1, numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.emit(ZkEVMContract, 'VerifyBatchesTrustedAggregator').withArgs(numBatch, newStateRoot, aggregator2.address);

        let aggregator2_balance_endVerifyBatches = await  ethers.provider.getBalance(aggregator2.address);
        expect(aggregator2_balance_endVerifyBatches).equal(aggregator2_balance_beforeVerifyBatches);


        // let aggregator2_real_endVerifyBatches = await depositContract.connect(aggregator2).punishAmounts(aggregator2.address);

    });

    it('two aggregators: no prover submit proof,  reward and punish', async () => {

        const l2txData = '0x123456';
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        const lastBatchSequenced = await ZkEVMContract.lastBatchSequenced();

        await ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address);
        await expect(ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address))
            .to.emit(ZkEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced.add(2));

        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';

        let numBatch = (await ZkEVMContract.lastVerifiedBatch()).add(1);
        const zkProofFFlonk = '0x20227cbcef731b6cbdc0edd5850c63dc7fbc27fb58d12cd4d08298799cf66a0512c230867d3375a1f4669e7267dad2c31ebcddbaccea6abd67798ceae35ae7611c665b6069339e6812d015e239594aa71c4e217288e374448c358f6459e057c91ad2ef514570b5dea21508e214430daadabdd23433820000fe98b1c6fa81d5c512b86fbf87bd7102775f8ef1da7e8014dc7aab225503237c7927c032e589e9a01a0eab9fda82ffe834c2a4977f36cc9bcb1f2327bdac5fb48ffbeb9656efcdf70d2656c328903e9fb96e4e3f470c447b3053cc68d68cf0ad317fe10aa7f254222e47ea07f3c1c3aacb74e5926a67262f261c1ed3120576ab877b49a81fb8aac51431858662af6b1a8138a44e9d0812d032340369459ccc98b109347cc874c7202dceecc3dbb09d7f9e5658f1ca3a92d22be1fa28f9945205d853e2c866d9b649301ac9857b07b92e4865283d3d5e2b711ea5f85cb2da71965382ece050508d3d008bbe4df5458f70bd3e1bfcc50b34222b43cd28cbe39a3bab6e464664a742161df99c607638e415ced49d0cd719518539ed5f561f81d07fe40d3ce85508e0332465313e60ad9ae271d580022ffca4fbe4d72d38d18e7a6e20d020a1d1e5a8f411291ab95521386fa538ddfe6a391d4a3669cc64c40f07895f031550b32f7d73205a69c214a8ef3cdf996c495e3fd24c00873f30ea6b2bfabfd38de1c3da357d1fefe203573fdad22f675cb5cfabbec0a041b1b31274f70193da8e90cfc4d6dc054c7cd26d09c1dadd064ec52b6ddcfa0cb144d65d9e131c0c88f8004f90d363034d839aa7760167b5302c36d2c2f6714b41782070b10c51c178bd923182d28502f36e19b079b190008c46d19c399331fd60b6b6bde898bd1dd0a71ee7ec7ff7124cc3d374846614389e7b5975b77c4059bc42b810673dbb6f8b951e5b636bdf24afd2a3cbe96ce8600e8a79731b4a56c697596e0bff7b73f413bdbc75069b002b00d713fae8d6450428246f1b794d56717050fdb77bbe094ac2ee6af54a153e2fb8ce1d31a86c4fdd523783b910bedf7db58a46ba6ce48ac3ca194f3cf2275e';

        let blockNumber = await ethers.provider.getBlockNumber();

        let proofhash = ethers.utils.solidityKeccak256(['bytes', 'address'], [ethers.utils.keccak256(zkProofFFlonk), aggregator1.address]);

        let aggregator2proofhash = ethers.utils.solidityKeccak256(['bytes', 'address'], [ethers.utils.keccak256(zkProofFFlonk), aggregator2.address]);

        await expect(ZkEVMContract.connect(aggregator1).submitProofHash(numBatch.sub(1), numBatch, proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').withArgs(aggregator1.address, numBatch.sub(1), numBatch, proofhash);

        await expect(ZkEVMContract.connect(aggregator2).submitProofHash(numBatch.sub(1), numBatch, aggregator2proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').withArgs(aggregator2.address, numBatch.sub(1), numBatch, aggregator2proofhash);

        const sequencedBatch = await ZkEVMContract.sequencedBatches(numBatch);
        expect(sequencedBatch.blockNumber).to.be.equal(blockNumber + 1);

        // 20 block submit
        for (let i = 0; i < 20 + 32 - 1; i++ ) {
            await hre.network.provider.request({
                method: "evm_mine",
            });
        }

        // let real_beforeVerifyBatches = await depositContract.connect(aggregator1).punishAmounts(aggregator1.address)


        let balance_beforeVerifyBatches = await  ethers.provider.getBalance(aggregator1.address);

        await expect(ZkEVMContract.connect(aggregator1).settle(aggregator1.address));

        let balance_endVerifyBatches = await  ethers.provider.getBalance(aggregator1.address);

        expect(balance_endVerifyBatches).equal(balance_beforeVerifyBatches);


        // let real_endVerifyBatches = await depositContract.connect(aggregator1).punishAmounts(aggregator1.address)


        // expect(real_endVerifyBatches).greaterThan(real_beforeVerifyBatches);


        // let aggregator2_real_beforeVerifyBatches = await depositContract.connect(aggregator2).punishAmounts(aggregator2.address)


        let aggregator2_balance_beforeVerifyBatches = await  ethers.provider.getBalance(aggregator2.address);

        await expect(ZkEVMContract.connect(aggregator2).settle(aggregator2.address));

        let aggregator2_balance_endVerifyBatches = await  ethers.provider.getBalance(aggregator2.address);
        expect(aggregator2_balance_endVerifyBatches).equal(aggregator2_balance_beforeVerifyBatches);


        // let aggregator2_real_endVerifyBatches = await depositContract.connect(aggregator2).punishAmounts(aggregator2.address)

    });

    it('one prover, submit multiple proofs', async () => {
        const l2txData = '0x123456';
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        const lastBatchSequenced = await ZkEVMContract.lastBatchSequenced();

        await ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address);
        await expect(ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address))
            .to.emit(ZkEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced.add(2));

        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';

        let numBatch = (await ZkEVMContract.lastVerifiedBatch()).add(1);
        const zkProofFFlonk = '0x20227cbcef731b6cbdc0edd5850c63dc7fbc27fb58d12cd4d08298799cf66a0512c230867d3375a1f4669e7267dad2c31ebcddbaccea6abd67798ceae35ae7611c665b6069339e6812d015e239594aa71c4e217288e374448c358f6459e057c91ad2ef514570b5dea21508e214430daadabdd23433820000fe98b1c6fa81d5c512b86fbf87bd7102775f8ef1da7e8014dc7aab225503237c7927c032e589e9a01a0eab9fda82ffe834c2a4977f36cc9bcb1f2327bdac5fb48ffbeb9656efcdf70d2656c328903e9fb96e4e3f470c447b3053cc68d68cf0ad317fe10aa7f254222e47ea07f3c1c3aacb74e5926a67262f261c1ed3120576ab877b49a81fb8aac51431858662af6b1a8138a44e9d0812d032340369459ccc98b109347cc874c7202dceecc3dbb09d7f9e5658f1ca3a92d22be1fa28f9945205d853e2c866d9b649301ac9857b07b92e4865283d3d5e2b711ea5f85cb2da71965382ece050508d3d008bbe4df5458f70bd3e1bfcc50b34222b43cd28cbe39a3bab6e464664a742161df99c607638e415ced49d0cd719518539ed5f561f81d07fe40d3ce85508e0332465313e60ad9ae271d580022ffca4fbe4d72d38d18e7a6e20d020a1d1e5a8f411291ab95521386fa538ddfe6a391d4a3669cc64c40f07895f031550b32f7d73205a69c214a8ef3cdf996c495e3fd24c00873f30ea6b2bfabfd38de1c3da357d1fefe203573fdad22f675cb5cfabbec0a041b1b31274f70193da8e90cfc4d6dc054c7cd26d09c1dadd064ec52b6ddcfa0cb144d65d9e131c0c88f8004f90d363034d839aa7760167b5302c36d2c2f6714b41782070b10c51c178bd923182d28502f36e19b079b190008c46d19c399331fd60b6b6bde898bd1dd0a71ee7ec7ff7124cc3d374846614389e7b5975b77c4059bc42b810673dbb6f8b951e5b636bdf24afd2a3cbe96ce8600e8a79731b4a56c697596e0bff7b73f413bdbc75069b002b00d713fae8d6450428246f1b794d56717050fdb77bbe094ac2ee6af54a153e2fb8ce1d31a86c4fdd523783b910bedf7db58a46ba6ce48ac3ca194f3cf2275e';

        let blockNumber = await ethers.provider.getBlockNumber();

        let proofhash = ethers.utils.solidityKeccak256(['bytes', 'address'], [ethers.utils.keccak256(zkProofFFlonk), aggregator1.address]);

        await expect(ZkEVMContract.connect(aggregator1).submitProofHash(numBatch.sub(1), numBatch, proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').withArgs(aggregator1.address, numBatch.sub(1), numBatch, proofhash);

        const sequencedBatch = await ZkEVMContract.sequencedBatches(numBatch);
        expect(sequencedBatch.blockNumber).to.be.equal(blockNumber + 1);

        let balance_beforeVerifyBatches = await  ethers.provider.getBalance(aggregator1.address);
        for (let i = 0; i < 20 - 1; i++ ) {
            await hre.network.provider.request({
                method: "evm_mine",
            });
        }
        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.emit(ZkEVMContract, 'VerifyBatchesTrustedAggregator').withArgs(numBatch, newStateRoot, aggregator1.address);
        let balance_endVerifyBatches = await  ethers.provider.getBalance(aggregator1.address);
        expect(balance_endVerifyBatches).greaterThan(balance_beforeVerifyBatches);

        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.be.reverted;
    });

    it('modify two commit epochs then submit', async () => {
        const l2txData = '0x123456';
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        const sequence = {
            transactions: l2txData,
            globalExitRoot: ethers.constants.HashZero,
            timestamp: currentTimestamp,
            minForcedTimestamp: 0,
        };

        const lastBatchSequenced = await ZkEVMContract.lastBatchSequenced();

        await ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address);
        await expect(ZkEVMContract.connect(trustedSequencer).sequenceBatches([sequence], trustedSequencer.address))
            .to.emit(ZkEVMContract, 'SequenceBatches')
            .withArgs(lastBatchSequenced.add(2));

        // set ProofHashCommitEpoch
        await expect(ZkEVMContract.connect(admin).setProofHashCommitEpoch(20)).to.emit(ZkEVMContract, 'SetProofHashCommitEpoch').withArgs(20);
        // set ProofCommitEpoch
        await expect(ZkEVMContract.connect(admin).setProofCommitEpoch(20)).to.emit(ZkEVMContract, 'SetProofCommitEpoch').withArgs(20);

        const newLocalExitRoot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const newStateRoot = '0x0000000000000000000000000000000000000000000000000000000000000002';

        let numBatch = (await ZkEVMContract.lastVerifiedBatch()).add(1);
        const zkProofFFlonk = '0x20227cbcef731b6cbdc0edd5850c63dc7fbc27fb58d12cd4d08298799cf66a0512c230867d3375a1f4669e7267dad2c31ebcddbaccea6abd67798ceae35ae7611c665b6069339e6812d015e239594aa71c4e217288e374448c358f6459e057c91ad2ef514570b5dea21508e214430daadabdd23433820000fe98b1c6fa81d5c512b86fbf87bd7102775f8ef1da7e8014dc7aab225503237c7927c032e589e9a01a0eab9fda82ffe834c2a4977f36cc9bcb1f2327bdac5fb48ffbeb9656efcdf70d2656c328903e9fb96e4e3f470c447b3053cc68d68cf0ad317fe10aa7f254222e47ea07f3c1c3aacb74e5926a67262f261c1ed3120576ab877b49a81fb8aac51431858662af6b1a8138a44e9d0812d032340369459ccc98b109347cc874c7202dceecc3dbb09d7f9e5658f1ca3a92d22be1fa28f9945205d853e2c866d9b649301ac9857b07b92e4865283d3d5e2b711ea5f85cb2da71965382ece050508d3d008bbe4df5458f70bd3e1bfcc50b34222b43cd28cbe39a3bab6e464664a742161df99c607638e415ced49d0cd719518539ed5f561f81d07fe40d3ce85508e0332465313e60ad9ae271d580022ffca4fbe4d72d38d18e7a6e20d020a1d1e5a8f411291ab95521386fa538ddfe6a391d4a3669cc64c40f07895f031550b32f7d73205a69c214a8ef3cdf996c495e3fd24c00873f30ea6b2bfabfd38de1c3da357d1fefe203573fdad22f675cb5cfabbec0a041b1b31274f70193da8e90cfc4d6dc054c7cd26d09c1dadd064ec52b6ddcfa0cb144d65d9e131c0c88f8004f90d363034d839aa7760167b5302c36d2c2f6714b41782070b10c51c178bd923182d28502f36e19b079b190008c46d19c399331fd60b6b6bde898bd1dd0a71ee7ec7ff7124cc3d374846614389e7b5975b77c4059bc42b810673dbb6f8b951e5b636bdf24afd2a3cbe96ce8600e8a79731b4a56c697596e0bff7b73f413bdbc75069b002b00d713fae8d6450428246f1b794d56717050fdb77bbe094ac2ee6af54a153e2fb8ce1d31a86c4fdd523783b910bedf7db58a46ba6ce48ac3ca194f3cf2275e';

        let blockNumber = await ethers.provider.getBlockNumber();

        let proofhash = ethers.utils.solidityKeccak256(['bytes', 'address'], [ethers.utils.keccak256(zkProofFFlonk), aggregator1.address]);
        let aggregator2proofhash = ethers.utils.solidityKeccak256(['bytes', 'address'], [ethers.utils.keccak256(zkProofFFlonk), aggregator2.address]);
        let aggregator3proofhash = ethers.utils.solidityKeccak256(['bytes', 'address'], [ethers.utils.keccak256(zkProofFFlonk), aggregator3.address]);

        // proofHashEpoch from 10 to 20; proofEpoch from 32 to 20
        /* agg 1: 1st proofHash, proof after 15 blks -- early;
                  proof after 20 blks -- too late */
        /* agg 2: submit proofHash 15 blks after 1st proofHash -- normal */
        /* agg 3: proofHash after 20 blks -- proofHash timeout */
        await expect(ZkEVMContract.connect(aggregator1).submitProofHash(numBatch.sub(1), numBatch, proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').withArgs(aggregator1.address, numBatch.sub(1), numBatch, proofhash);

        const sequencedBatch = await ZkEVMContract.sequencedBatches(numBatch);
        expect(sequencedBatch.blockNumber).to.be.equal(blockNumber + 1);

        for (let i = 0; i < 15 - 1; i++ ) {
            await hre.network.provider.request({
                method: "evm_mine",
            });
        }
        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.be.revertedWithCustomError(ZkEVMContract, 'SubmitProofEarly');

        await expect(ZkEVMContract.connect(aggregator2).submitProofHash(numBatch.sub(1), numBatch, aggregator2proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').withArgs(aggregator2.address, numBatch.sub(1), numBatch, aggregator2proofhash);
        for (let i = 0; i < 5; i++ ) {
            await hre.network.provider.request({
                method: "evm_mine",
            });
        }

        
        await expect(ZkEVMContract.connect(aggregator3).submitProofHash(numBatch.sub(1), numBatch, aggregator3proofhash)).to.emit(ZkEVMContract, 'SubmitProofHash').to.be.revertedWithCustomError(ZkEVMContract, 'CommittedTimeout')

        for (let i = 0; i < 21; i++ ) {
            await hre.network.provider.request({
                method: "evm_mine",
            });
        }
        await expect(ZkEVMContract.connect(aggregator1).verifyBatches(numBatch.sub(1), numBatch, newLocalExitRoot, newStateRoot, zkProofFFlonk)).to.be.revertedWithCustomError(ZkEVMContract, 'SubmitProofTooLate');

    })

})
