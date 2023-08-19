require('dotenv').config();
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
require('@openzeppelin/hardhat-upgrades');
// require('@nomiclabs/hardhat-waffle');
require('hardhat-gas-reporter');
require('solidity-coverage');
require('hardhat-dependency-compiler');
require('hardhat-contract-sizer');

const path = require('path');

const DEFAULT_MNEMONIC = 'test test test test test test test test test test test junk';

const config: HardhatUserConfig = {
  dependencyCompiler: {
    paths: [
      '@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol',
      '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol',
      '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol'
    ]//,
    //keep: true
  },
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999
          }
        }
      },
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999
          }
        }
      },
      {
        version: "0.6.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999
          }
        }
      },
      {
        version: "0.5.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999
          }
        }
      },
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999
          }
        }
      }
    ]
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    // strict: true,
  },
  networks: {
    opsideTestnet: {
      url: `https://pre-alpha-us-http-geth.opside.network`,
      chainId: 51178,
      gasPrice: 1100000000000,
      gas: 5000000,
      accounts: [`${process.env.PRIVATE_KEY}`],
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      // accounts: [`${process.env.PRIVATE_KEY}`],
    },
    hardhat: {
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
  },
  etherscan: {
    apiKey: {
      opsideTestnet: `${process.env.ETHERSCAN_OPSIDE_API_KEY}`,
      goerli: `${process.env.ETHERSCAN_API_KEY}`,
      mainnet: `${process.env.ETHERSCAN_API_KEY}`
    },
  },
};

export default config;
