import { Contract, Wallet, AbiCoder, parseUnits } from 'ethers';
import { AAVE_POOL_ABI, ERC20_ABI } from '../config/abis/index.ts';
import { DEXSwapper } from './dex-swapper.ts';
import { logger } from '../utils/logger.ts';
import type { LiquidationOpportunity, LiquidationResult, ChainName } from '../types/index.ts';

/**
 * Flash Loan Executor - Handles liquidations using AAVE flash loans
 *
 * This is a SIMPLIFIED version that works WITHOUT a custom smart contract.
 * It uses AAVE's flash loan callback mechanism.
 *
 * IMPORTANT: For production, you should deploy a smart contract to handle
 * the flash loan callback for better gas efficiency and success rates.
 */
export class FlashLoanExecutor {
  private wallet: Wallet;
  private chain: ChainName;
  private dexSwapper: DEXSwapper;
  private abiCoder: AbiCoder;

  constructor(
    wallet: Wallet,
    chain: ChainName,
    dexSwapper: DEXSwapper
  ) {
    this.wallet = wallet;
    this.chain = chain;
    this.dexSwapper = dexSwapper;
    this.abiCoder = AbiCoder.defaultAbiCoder();
  }

  /**
   * Execute liquidation WITH flash loan (zero capital required)
   *
   * WARNING: This is a simplified implementation. For production:
   * 1. Deploy a smart contract that implements IFlashLoanSimpleReceiver
   * 2. Use that contract address as the receiver
   * 3. The contract will handle the liquidation + swap + repayment atomically
   */
  async executeWithFlashLoan(
    opportunity: LiquidationOpportunity,
    poolAddress: string
  ): Promise<LiquidationResult> {
    const startTime = Date.now();

    try {
      logger.info('⚡ Attempting flash loan liquidation', {
        chain: this.chain,
        protocol: opportunity.protocol,
        user: opportunity.user,
        debtAsset: opportunity.debtAssetSymbol,
        collateralAsset: opportunity.collateralAssetSymbol,
        estimatedProfit: opportunity.netProfitUSD.toFixed(2),
      });

      // NOTE: This will fail because we need a contract to receive the flash loan
      // This is left here as a template for when you deploy a flash loan receiver contract

      logger.error('❌ Flash loan execution requires a deployed contract');
      logger.info('💡 Use executeWithOwnCapital() instead, or deploy a flash loan receiver contract');

      return {
        success: false,
        chain: this.chain,
        protocol: opportunity.protocol,
        error: 'Flash loan receiver contract not deployed. Use executeWithOwnCapital() for now.',
        timestamp: new Date(),
      };

    } catch (error) {
      logger.error('Flash loan execution failed', { error });

      return {
        success: false,
        chain: this.chain,
        protocol: opportunity.protocol,
        error: String(error),
        timestamp: new Date(),
      };
    }
  }

  /**
   * Execute liquidation using bot's own capital
   *
   * This is the SIMPLE VERSION that works immediately.
   * Requires you to have the debt token in your wallet.
   *
   * Flow:
   * 1. Check you have enough debt token
   * 2. Approve AAVE pool to spend debt token
   * 3. Execute liquidation (get collateral)
   * 4. Swap collateral for USDC/stablecoin
   * 5. Profit!
   */
  async executeWithOwnCapital(
    opportunity: LiquidationOpportunity,
    poolAddress: string
  ): Promise<LiquidationResult> {
    const startTime = Date.now();

    try {
      logger.info('💰 Executing liquidation with own capital', {
        chain: this.chain,
        protocol: opportunity.protocol,
        user: opportunity.user,
        debtToCover: opportunity.debtToCover.toString(),
        estimatedProfit: opportunity.netProfitUSD.toFixed(2),
      });

      const pool = new Contract(poolAddress, AAVE_POOL_ABI, this.wallet);
      const debtToken = new Contract(opportunity.debtAsset, ERC20_ABI, this.wallet);
      const collateralToken = new Contract(opportunity.collateralAsset, ERC20_ABI, this.wallet);

      // 1. Check balance
      if (!debtToken.balanceOf) {
        throw new Error('debtToken.balanceOf not available');
      }
      const balance = await debtToken.balanceOf(this.wallet.address);
      if (balance < opportunity.debtToCover) {
        logger.error('Insufficient debt token balance', {
          required: opportunity.debtToCover.toString(),
          available: balance.toString(),
        });

        return {
          success: false,
          chain: this.chain,
          protocol: opportunity.protocol,
          error: `Insufficient ${opportunity.debtAssetSymbol} balance`,
          timestamp: new Date(),
        };
      }

      // 2. Approve pool to spend debt token
      logger.info('Approving debt token...');

      if (!debtToken.allowance || !debtToken.approve) {
        throw new Error('debtToken.allowance or approve not available');
      }

      const allowance = await debtToken.allowance(this.wallet.address, poolAddress);

      if (allowance < opportunity.debtToCover) {
        const approveTx = await debtToken.approve(poolAddress, opportunity.debtToCover);
        await approveTx.wait();
        logger.info('✅ Approval confirmed');
      }

      // 3. Get collateral balance before liquidation
      if (!collateralToken.balanceOf) {
        throw new Error('collateralToken.balanceOf not available');
      }
      const collateralBefore = await collateralToken.balanceOf(this.wallet.address);

      // 4. Execute liquidation
      logger.info('Executing liquidation call...');

      if (!pool.liquidationCall) {
        throw new Error('pool.liquidationCall not available');
      }

      const liquidationTx = await pool.liquidationCall(
        opportunity.collateralAsset,
        opportunity.debtAsset,
        opportunity.user,
        opportunity.debtToCover,
        false, // Don't receive aToken
        {
          gasLimit: opportunity.gasEstimate,
        }
      );

      logger.info('⏳ Waiting for confirmation...', { txHash: liquidationTx.hash });
      const receipt = await liquidationTx.wait();

      if (!receipt || receipt.status === 0) {
        throw new Error('Transaction failed');
      }

      logger.info('✅ Liquidation successful!', { txHash: receipt.hash });

      // 5. Get collateral received
      const collateralAfter = await collateralToken.balanceOf(this.wallet.address);
      const collateralReceived = BigInt(collateralAfter) - BigInt(collateralBefore);

      logger.info('Collateral received', {
        amount: collateralReceived.toString(),
        symbol: opportunity.collateralAssetSymbol,
      });

      // 6. Swap collateral to stablecoin (optional but recommended for profit taking)
      let finalProfit = 0;

      if (collateralReceived > 0n) {
        try {
          logger.info('Swapping collateral to maximize profit...');

          // Swap to debt token to recover capital
          await this.dexSwapper.swap(
            opportunity.collateralAsset,
            opportunity.debtAsset,
            collateralReceived
          );

          // Calculate actual profit
          if (!debtToken.balanceOf) {
            throw new Error('debtToken.balanceOf not available');
          }
          const finalBalance = await debtToken.balanceOf(this.wallet.address);
          const profitTokens = finalBalance - balance; // balance is what we started with

          if (profitTokens > 0n) {
            // Estimate USD value (simplified)
            finalProfit = opportunity.netProfitUSD; // Use estimated for now
            logger.info('💰 PROFIT!', { amount: finalProfit.toFixed(2), usd: true });
          }
        } catch (swapError) {
          logger.warn('Swap failed, but liquidation succeeded', { swapError });
          // Still count as success since we got the collateral
        }
      }

      // 7. Calculate gas cost
      const gasUsed = receipt.gasUsed;
      const gasPrice = receipt.gasPrice || 0n;
      const gasCostWei = gasUsed * gasPrice;
      const ethPrice = 2500; // TODO: Get real ETH price
      const gasCostUSD = parseFloat(gasCostWei.toString()) / 1e18 * ethPrice;

      const executionTime = Date.now() - startTime;

      logger.info('📊 Liquidation complete', {
        executionTime: `${executionTime}ms`,
        gasUsed: gasUsed.toString(),
        gasCost: gasCostUSD.toFixed(2),
        profit: finalProfit.toFixed(2),
      });

      return {
        success: true,
        chain: this.chain,
        protocol: opportunity.protocol,
        txHash: receipt.hash,
        profit: finalProfit,
        gasUsed,
        gasCostUSD,
        timestamp: new Date(),
      };

    } catch (error) {
      logger.error('❌ Liquidation with own capital failed', { error });

      return {
        success: false,
        chain: this.chain,
        protocol: opportunity.protocol,
        error: String(error),
        timestamp: new Date(),
      };
    }
  }

  /**
   * Simulate liquidation to check if it will succeed
   * This uses eth_call to simulate without actually sending a transaction
   */
  async simulate(
    opportunity: LiquidationOpportunity,
    poolAddress: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      logger.info('🔬 Simulating liquidation...');

      const pool = new Contract(poolAddress, AAVE_POOL_ABI, this.wallet);

      // Try to call liquidationCall as a static call (simulation)
      if (!pool.liquidationCall || !pool.liquidationCall.staticCall) {
        throw new Error('pool.liquidationCall.staticCall not available');
      }

      await pool.liquidationCall.staticCall(
        opportunity.collateralAsset,
        opportunity.debtAsset,
        opportunity.user,
        opportunity.debtToCover,
        false
      );

      logger.info('✅ Simulation successful');
      return { success: true };

    } catch (error: any) {
      const errorMessage = error?.message || error?.reason || String(error);
      const errorData = error?.data || error?.error || {};

      logger.warn('⚠️  Simulation failed', {
        message: errorMessage,
        code: error?.code,
        data: errorData,
        fullError: error
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
