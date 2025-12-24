// AAVE v3 Pool ABI - Essential functions for both Base and Arbitrum
export const AAVE_POOL_ABI = [
  'function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external',
  'function liquidationCall(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken) external',
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referral)',
  'event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referral)',
  'event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)',
  'event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)',
];

// AAVE Pool Data Provider ABI
export const AAVE_DATA_PROVIDER_ABI = [
  'function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)',
  'function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)',
  'function getAllReservesTokens() external view returns (tuple(string symbol, address tokenAddress)[] memory)',
  'function getReserveTokensAddresses(address asset) external view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)',
];

// AAVE Oracle ABI
export const AAVE_ORACLE_ABI = [
  'function getAssetPrice(address asset) external view returns (uint256)',
  'function getAssetsPrices(address[] calldata assets) external view returns (uint256[] memory)',
];

// Radiant Capital - Same interface as AAVE v2
export const RADIANT_LENDING_POOL_ABI = [
  'function flashLoan(address receiverAddress, address[] calldata assets, uint256[] calldata amounts, uint256[] calldata modes, address onBehalfOf, bytes calldata params, uint16 referralCode) external',
  'function liquidationCall(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken) external',
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralETH, uint256 totalDebtETH, uint256 availableBorrowsETH, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
];

// Radiant Data Provider
export const RADIANT_DATA_PROVIDER_ABI = [
  'function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)',
  'function getReserveConfigurationData(address asset) external view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)',
  'function getAllReservesTokens() external view returns (tuple(string symbol, address tokenAddress)[] memory)',
];

// Moonwell Comptroller ABI
export const MOONWELL_COMPTROLLER_ABI = [
  'function getAccountLiquidity(address account) external view returns (uint256, uint256, uint256)',
  'function liquidateCalculateSeizeTokens(address mTokenBorrowed, address mTokenCollateral, uint256 actualRepayAmount) external view returns (uint256, uint256)',
  'function getAllMarkets() external view returns (address[] memory)',
  'function checkMembership(address account, address mToken) external view returns (bool)',
  'function markets(address mToken) external view returns (bool isListed, uint256 collateralFactorMantissa)',
];

// Moonwell MToken ABI
export const MOONWELL_MTOKEN_ABI = [
  'function liquidateBorrow(address borrower, uint256 repayAmount, address mTokenCollateral) external returns (uint256)',
  'function borrowBalanceCurrent(address account) external returns (uint256)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function getAccountSnapshot(address account) external view returns (uint256, uint256, uint256, uint256)',
  'function underlying() external view returns (address)',
  'function exchangeRateCurrent() external returns (uint256)',
];

// Compound v3 Comet ABI
export const COMPOUND_V3_COMET_ABI = [
  'function absorb(address absorber, address[] calldata accounts) external',
  'function isLiquidatable(address account) external view returns (bool)',
  'function borrowBalanceOf(address account) external view returns (uint256)',
  'function collateralBalanceOf(address account, address asset) external view returns (uint128)',
  'function userCollateral(address account, address asset) external view returns (uint128 balance, uint128 _reserved)',
  'function baseToken() external view returns (address)',
  'function getAssetInfoByAddress(address asset) external view returns (uint8 offset, address asset, address priceFeed, uint64 scale, uint64 borrowCollateralFactor, uint64 liquidateCollateralFactor, uint64 liquidationFactor, uint128 supplyCap)',
];

// Silo Finance - Silo ABI
export const SILO_ABI = [
  'function liquidationCall(address _collateralAsset, address _debtAsset, address _user, uint256 _debtToCover, bool _receiveCollateral) external',
  'function getUserAccountData(address _user) external view returns (uint256 totalCollateralETH, uint256 totalDebtETH, uint256 availableBorrowsETH, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
];

// Uniswap V3 Router ABI
export const UNISWAP_V3_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum)) external payable returns (uint256 amountOut)',
];

// Standard Router ABI (for Baseswap, Aerodrome, Camelot, Sushiswap)
export const STANDARD_ROUTER_ABI = [
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  'function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
];

// ERC20 ABI
export const ERC20_ABI = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) external returns (bool)',
];
