export type ChainName = 'base' | 'arbitrum';
export type ProtocolName = 'aave' | 'moonwell' | 'compound' | 'radiant' | 'silo';

export interface CollateralAsset {
  asset: string;
  symbol: string;
  balance: bigint;
  valueUSD: number;
  liquidationThreshold: number;
}

export interface DebtAsset {
  asset: string;
  symbol: string;
  balance: bigint;
  valueUSD: number;
}

export interface UserPosition {
  user: string;
  chain: ChainName;
  protocol: ProtocolName;
  healthFactor: number;
  totalCollateralUSD: number;
  totalDebtUSD: number;
  collateralAssets: CollateralAsset[];
  debtAssets: DebtAsset[];
}

export interface LiquidationOpportunity {
  user: string;
  chain: ChainName;
  protocol: ProtocolName;
  debtAsset: string;
  debtAssetSymbol: string;
  collateralAsset: string;
  collateralAssetSymbol: string;
  debtToCover: bigint;
  expectedCollateral: bigint;
  liquidationBonus: number;
  estimatedProfitUSD: number;
  gasEstimate: bigint;
  gasCostUSD: number;
  netProfitUSD: number;
  profitable: boolean;
  healthFactor: number;
  priority: number; // Calculated priority score
}

export interface GasConfig {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasLimit: bigint;
}

export interface LiquidationResult {
  success: boolean;
  chain: ChainName;
  protocol: ProtocolName;
  txHash?: string;
  profit?: number;
  error?: string;
  gasUsed?: bigint;
  gasCostUSD?: number;
  timestamp: Date;
}

export interface ChainConfig {
  chainId: number;
  name: ChainName;
  rpc: {
    primary: string;
    backup: string[];
  };
  gas: GasConfig;
  protocols: ProtocolName[];
  minProfitUSD: number;
  checkInterval: number;
}

export interface BotConfig {
  activeChains: ChainName[];
  baseConfig?: ChainSpecificConfig;
  arbitrumConfig?: ChainSpecificConfig;
  maxSlippage: number;
  simulateBeforeExecute: boolean;
  maxConsecutiveFailures: number;
  pauseDuration: number;
  telegramBotToken?: string;
  telegramChatId?: string;
  notificationMinProfit: number;
  summaryIntervalHours: number;
}

export interface ChainSpecificConfig {
  privateKey: string;
  rpcUrl: string;
  rpcWsUrl?: string;
  protocols: ProtocolName[];
  minProfitUSD: number;
  maxLiquidationSize: number;
  checkInterval: number;
  maxGasPrice: number;
  maxFeePerGas: number;
  priorityFee: number;
  flashLoanProvider: 'aave' | 'balancer';
}

export interface BotMetrics {
  totalLiquidations: number;
  successfulLiquidations: number;
  failedLiquidations: number;
  totalProfitUSD: number;
  totalGasSpentUSD: number;
  averageProfitPerLiquidation: number;
  successRate: number;
  uptime: number;
  lastLiquidation?: Date;
  consecutiveFailures: number;
  startTime: Date;
}

export interface ChainMetrics extends BotMetrics {
  chain: ChainName;
  protocolBreakdown: Map<ProtocolName, ProtocolMetrics>;
}

export interface ProtocolMetrics {
  protocol: ProtocolName;
  liquidations: number;
  successRate: number;
  totalProfit: number;
  averageProfit: number;
  bestProfit: number;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
}

export interface PriceData {
  token: string;
  priceUSD: number;
  timestamp: number;
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  minAmountOut: bigint;
  recipient: string;
  deadline: number;
}

export interface FlashLoanParams {
  asset: string;
  amount: bigint;
  userData: string;
}

export interface ProtocolConfig {
  name: ProtocolName;
  liquidationBonus: number;
  closeFactor: number;
  weight: number; // Priority weight
}

export interface DEXConfig {
  router: string;
  name: string;
  fee?: number;
}

export interface ReserveData {
  asset: string;
  decimals: number;
  ltv: number;
  liquidationThreshold: number;
  liquidationBonus: number;
  usageAsCollateralEnabled: boolean;
  borrowingEnabled: boolean;
  isActive: boolean;
}

export interface UserReserveData {
  asset: string;
  currentATokenBalance: bigint;
  currentStableDebt: bigint;
  currentVariableDebt: bigint;
  usageAsCollateralEnabled: boolean;
}
