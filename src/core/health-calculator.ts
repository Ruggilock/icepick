import { formatUnits } from 'ethers';

/**
 * Calculate health factor for a lending position
 *
 * Health Factor = (Total Collateral in USD × Weighted Avg Liquidation Threshold) / Total Debt in USD
 *
 * HF < 1.0 = Position can be liquidated
 * HF >= 1.0 = Position is healthy
 */

interface HealthFactorInput {
  totalCollateralUSD: number;
  totalDebtUSD: number;
  liquidationThreshold: number; // 0.0 to 1.0 (e.g., 0.82 for 82%)
}

export function calculateHealthFactor(input: HealthFactorInput): number {
  const { totalCollateralUSD, totalDebtUSD, liquidationThreshold } = input;

  if (totalDebtUSD === 0) {
    return Number.MAX_SAFE_INTEGER; // No debt = infinite health factor
  }

  if (totalCollateralUSD === 0) {
    return 0; // No collateral = zero health factor
  }

  const adjustedCollateral = totalCollateralUSD * liquidationThreshold;
  const healthFactor = adjustedCollateral / totalDebtUSD;

  return healthFactor;
}

/**
 * Calculate max debt that can be covered in a liquidation
 */
export function calculateMaxDebtToCover(
  totalDebt: bigint,
  closeFactor: number // 0.0 to 1.0 (e.g., 0.5 for 50%)
): bigint {
  const closeFactorBigInt = BigInt(Math.floor(closeFactor * 10000));
  return (totalDebt * closeFactorBigInt) / 10000n;
}

/**
 * Calculate expected collateral to receive from liquidation
 */
export function calculateCollateralToReceive(
  debtToCover: bigint,
  debtPriceUSD: number,
  collateralPriceUSD: number,
  liquidationBonus: number, // 0.0 to 1.0 (e.g., 0.05 for 5%)
  debtDecimals: number = 18,
  collateralDecimals: number = 18
): bigint {
  // Convert debt to USD value
  const debtValueUSD = parseFloat(formatUnits(debtToCover, debtDecimals)) * debtPriceUSD;

  // Add liquidation bonus
  const collateralValueUSD = debtValueUSD * (1 + liquidationBonus);

  // Convert to collateral tokens
  const collateralAmount = collateralValueUSD / collateralPriceUSD;

  // Convert to bigint with proper decimals
  return BigInt(Math.floor(collateralAmount * 10 ** collateralDecimals));
}
