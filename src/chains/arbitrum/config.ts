import { parseUnits } from 'ethers';
import type { ProtocolConfig, DEXConfig } from '../../types/index.ts';

export const ARBITRUM_CHAIN_ID = 42161;
export const ARBITRUM_CHAIN_NAME = 'arbitrum';

// AAVE v3 on Arbitrum
export const AAVE_V3_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
export const AAVE_V3_POOL_DATA_PROVIDER = '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654';
export const AAVE_V3_ORACLE = '0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7';

// Radiant Capital on Arbitrum - 10% LIQUIDATION BONUS!
export const RADIANT_LENDING_POOL = '0xF4B1486DD74D07706052A33d31d7c0AAFD0659E1';
export const RADIANT_DATA_PROVIDER = '0x596B0cc4c5094507C50b579a662FE7e7b094A2cC';
export const RADIANT_ORACLE = '0x3a33473d7990a605a88ac72A78aD4EFC40a54ADB';

// Compound v3 on Arbitrum
export const COMPOUND_V3_COMET_USDC = '0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA';
export const COMPOUND_V3_COMET_USDCe = '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf';

// Silo Finance on Arbitrum
export const SILO_FACTORY = '0x4D919CEcfD4793c0D47866C8d0a02a0950737589';
export const SILO_REPOSITORY = '0x8658047e48CC09161f4152c79155Dac1d710Ff0a';

// DEX Routers on Arbitrum
export const UNISWAP_V3_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
export const SUSHISWAP_ROUTER = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';
export const CAMELOT_ROUTER = '0xc873fEcbd354f5A56E00E710B90EF4201db2448d';

// Common Tokens on Arbitrum
export const TOKENS = {
  WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  USDCe: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // Bridged USDC
  USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
};

// Protocol Configurations with Priority
export const PROTOCOL_CONFIGS: ProtocolConfig[] = [
  {
    name: 'radiant',
    liquidationBonus: 10, // 10% - HIGHEST BONUS!
    closeFactor: 50,
    weight: 1.0, // Absolute priority
  },
  {
    name: 'silo',
    liquidationBonus: 7, // 7% - Good bonus, less competition
    closeFactor: 50,
    weight: 0.95, // Second priority
  },
  {
    name: 'aave',
    liquidationBonus: 5, // 5%
    closeFactor: 50,
    weight: 0.85, // Third priority
  },
  {
    name: 'compound',
    liquidationBonus: 5, // 5%
    closeFactor: 100,
    weight: 0.7, // Fourth priority
  },
];

// DEX Configurations
export const DEX_CONFIGS: DEXConfig[] = [
  {
    router: UNISWAP_V3_ROUTER,
    name: 'UniswapV3',
    fee: 3000, // 0.3%
  },
  {
    router: CAMELOT_ROUTER,
    name: 'Camelot',
  },
  {
    router: SUSHISWAP_ROUTER,
    name: 'Sushiswap',
  },
];

// Gas Configuration (Arbitrum has cheap gas)
export const ARBITRUM_GAS_CONFIG = {
  maxFeePerGas: parseUnits('0.1', 'gwei'),
  maxPriorityFeePerGas: parseUnits('0.01', 'gwei'),
  gasLimit: 1000000n, // Arbitrum may need more gas
};

// Flash Loan Fee
export const AAVE_FLASH_LOAN_FEE = 0.0009; // 0.09%
export const RADIANT_FLASH_LOAN_FEE = 0.0009; // 0.09%

// Close Factors
export const DEFAULT_CLOSE_FACTOR = 0.5; // 50%
export const COMPOUND_CLOSE_FACTOR = 1.0; // 100%
