import { formatUnits } from 'ethers';
import type { LiquidationOpportunity } from '../types/index.ts';

interface ProfitCalculationInput {
  debtToCover: bigint;
  debtAssetPriceUSD: number;
  collateralToReceive: bigint;
  collateralAssetPriceUSD: number;
  liquidationBonus: number;
  flashLoanFee: number; // 0.0009 for 0.09%
  gasEstimate: bigint;
  gasPriceWei: bigint;
  ethPriceUSD: number;
  swapSlippage: number; // 0.02 for 2%
  debtDecimals?: number;
  collateralDecimals?: number;
}

export interface ProfitCalculationResult {
  debtValueUSD: number;
  collateralValueUSD: number;
  grossProfitUSD: number;
  flashLoanFeeUSD: number;
  gasCostUSD: number;
  slippageCostUSD: number;
  netProfitUSD: number;
  profitable: boolean;
  profitMargin: number; // Percentage
}

export function calculateProfit(input: ProfitCalculationInput): ProfitCalculationResult {
  const {
    debtToCover,
    debtAssetPriceUSD,
    collateralToReceive,
    collateralAssetPriceUSD,
    flashLoanFee,
    gasEstimate,
    gasPriceWei,
    ethPriceUSD,
    swapSlippage,
    debtDecimals = 18,
    collateralDecimals = 18,
  } = input;

  // Calculate debt value in USD
  const debtValueUSD = parseFloat(formatUnits(debtToCover, debtDecimals)) * debtAssetPriceUSD;

  // Calculate collateral value in USD
  const collateralValueUSD = parseFloat(formatUnits(collateralToReceive, collateralDecimals)) * collateralAssetPriceUSD;

  // Gross profit (before fees)
  const grossProfitUSD = collateralValueUSD - debtValueUSD;

  // Flash loan fee
  const flashLoanFeeUSD = debtValueUSD * flashLoanFee;

  // Gas cost
  const gasCostWei = gasEstimate * gasPriceWei;
  const gasCostETH = parseFloat(formatUnits(gasCostWei, 18));
  const gasCostUSD = gasCostETH * ethPriceUSD;

  // Slippage cost (when swapping collateral to debt token)
  const slippageCostUSD = collateralValueUSD * swapSlippage;

  // Net profit
  const netProfitUSD = grossProfitUSD - flashLoanFeeUSD - gasCostUSD - slippageCostUSD;

  // Profit margin
  const profitMargin = (netProfitUSD / debtValueUSD) * 100;

  return {
    debtValueUSD,
    collateralValueUSD,
    grossProfitUSD,
    flashLoanFeeUSD,
    gasCostUSD,
    slippageCostUSD,
    netProfitUSD,
    profitable: netProfitUSD > 0,
    profitMargin,
  };
}

/**
 * Calculate priority score for an opportunity
 * Higher score = higher priority
 */
export function calculatePriorityScore(
  opportunity: LiquidationOpportunity,
  chainCompetitionFactor: number = 1.0 // Lower competition = higher factor
): number {
  const {
    netProfitUSD,
    liquidationBonus,
    healthFactor,
  } = opportunity;

  // Base score from net profit
  let score = netProfitUSD;

  // Bonus for higher liquidation bonus (multiply by 10 to make significant)
  score += (liquidationBonus * 10);

  // Bonus for lower health factor (more urgent)
  const urgencyBonus = healthFactor < 0.95 ? 10 : 0;
  score += urgencyBonus;

  // Chain competition factor (Base has less competition)
  score *= chainCompetitionFactor;

  return score;
}
