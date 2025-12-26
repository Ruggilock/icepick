// AAVE v3 configuration for Linea
// Source: https://lineascan.build/address/0xc47b8c00b0f69a36fa203ffeac0334874574a8ac

export const AAVE_V3_POOL = '0xc47b8C00b0f69a36fa203Ffeac0334874574a8Ac';
export const AAVE_V3_POOL_ADDRESSES_PROVIDER = '0x89502C3731f69dDc95B65753708a07f8cd0373f4';

// Oracle - Standard AAVE v3 Oracle address (will query from PoolAddressesProvider if needed)
export const AAVE_V3_ORACLE = '0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156';

// Pool Data Provider - Standard AAVE v3 pattern (fallback to querying from PoolAddressesProvider)
export const AAVE_V3_POOL_DATA_PROVIDER = '0x2b0fD22030046B06DC3aB8ca5Df7D90e5fD8bdAE';

// DEX Routers for swapping collateral to USDC
export const UNISWAP_V3_ROUTER = '0x68b3465833fb72A70ecdf485E0e4c7bD8665Fc45';
export const PANCAKESWAP_V3_ROUTER = '0x13f4EA83d0bD40E75C8222255bc855a974568Dd4';

// USDC on Linea
export const USDC_ADDRESS = '0x176211869cA2b568f2A7D4EE941E073a821EE1ff';

// WETH on Linea
export const WETH_ADDRESS = '0xe5D7C2a44FfDf6b295A15c148167daaAf5Cf34f';

// Flash loan fee (same as AAVE v3)
export const AAVE_FLASH_LOAN_FEE = 0.0009; // 0.09%
export const DEFAULT_CLOSE_FACTOR = 0.5; // 50%
