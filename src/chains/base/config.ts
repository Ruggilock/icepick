import { parseUnits } from 'ethers';
import type { ProtocolConfig, DEXConfig } from '../../types/index.ts';

export const BASE_CHAIN_ID = 8453;
export const BASE_CHAIN_NAME = 'base';

// Multicall3 on Base (same address on all chains)
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

// AAVE v3 on Base
export const AAVE_V3_POOL = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
export const AAVE_V3_POOL_DATA_PROVIDER = '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac';
export const AAVE_V3_ORACLE = '0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156';

// Moonwell on Base
export const MOONWELL_COMPTROLLER = '0xfBb21d0380beE3312B33c4353c8936a0F13EF26C';
export const MOONWELL_ORACLE = '0xEC942bE8A8114bFD0396A5052c36027f2cA6a9d0';

// Compound v3 on Base (USDC market)
export const COMPOUND_V3_COMET_USDC = '0xb125E6687d4313864e53df431d5425969c15Eb2F';

// DEX Routers on Base
export const UNISWAP_V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';
export const BASESWAP_ROUTER = '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86';
export const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43';

// Common Tokens on Base
export const TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', // Bridged USDC
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
};

// Protocol Configurations with Priority (AAVE only)
export const PROTOCOL_CONFIGS: ProtocolConfig[] = [
  {
    name: 'aave',
    liquidationBonus: 5, // 5%
    closeFactor: 50,
    weight: 1.0,
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
    router: AERODROME_ROUTER,
    name: 'Aerodrome',
  },
  {
    router: BASESWAP_ROUTER,
    name: 'Baseswap',
  },
];

// Gas Configuration (Base has VERY cheap gas)
export const BASE_GAS_CONFIG = {
  maxFeePerGas: parseUnits('0.05', 'gwei'), // Very low
  maxPriorityFeePerGas: parseUnits('0.01', 'gwei'),
  gasLimit: 800000n,
};

// Flash Loan Fee
export const AAVE_FLASH_LOAN_FEE = 0.0009; // 0.09%

// Close Factors
export const DEFAULT_CLOSE_FACTOR = 0.5; // 50%
export const COMPOUND_CLOSE_FACTOR = 1.0; // 100%
