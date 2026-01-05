import { loadConfig } from './config/index.ts';
import { logger } from './utils/logger.ts';
import { RPCManager } from './utils/rpc-manager.ts';
import { TelegramNotifier } from './utils/notifications.ts';
import { DEXSwapper } from './core/dex-swapper.ts';
import { FlashLoanExecutor } from './core/flashloan-executor.ts';
import { AAVEv3Base } from './chains/base/protocols/aave-v3.ts';
import type { ChainMetrics, LiquidationOpportunity } from './types/index.ts';
import { AAVE_V3_POOL } from './chains/base/config.ts';

class BaseLiquidator {
  private config: ReturnType<typeof loadConfig>;
  private rpcManager: RPCManager;
  private notifier: TelegramNotifier;
  private metrics: ChainMetrics;
  private aaveProtocol?: AAVEv3Base;
  private isRunning: boolean = false;
  private isExecutingLiquidation: boolean = false;
  private summaryInterval?: Timer;
  private ethPriceUSD: number = 2500;
  private ethPriceLastUpdated: number = 0;
  private readonly ETH_PRICE_UPDATE_INTERVAL = 60000; // 1 minute

  // Blacklist users that constantly recover (avoid wasting time)
  private failedAttempts: Map<string, { count: number; lastAttempt: number; debtUSD: number }> = new Map();
  private readonly MAX_FAILED_ATTEMPTS = 3;
  private readonly BLACKLIST_DURATION = 300000; // 5 minutes

  constructor() {
    this.config = loadConfig();

    if (!this.config.baseConfig) {
      throw new Error('Base configuration is required');
    }

    const backupRpcs = [
      process.env.BASE_RPC_BACKUP_1,
      process.env.BASE_RPC_BACKUP_2,
    ].filter((rpc): rpc is string => typeof rpc === 'string' && rpc.length > 0);

    this.rpcManager = new RPCManager('base', this.config.baseConfig.rpcUrl, backupRpcs);

    this.notifier = new TelegramNotifier(
      this.config.telegramBotToken,
      this.config.telegramChatId,
      this.config.notificationMinProfit
    );

    this.metrics = {
      chain: 'base',
      totalLiquidations: 0,
      successfulLiquidations: 0,
      failedLiquidations: 0,
      totalProfitUSD: 0,
      totalGasSpentUSD: 0,
      averageProfitPerLiquidation: 0,
      successRate: 0,
      uptime: 0,
      consecutiveFailures: 0,
      startTime: new Date(),
      protocolBreakdown: new Map(),
    };
  }

  async start(): Promise<void> {
    logger.info('🚀 Base Liquidation Bot Starting...');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const chainConfig = this.config.baseConfig!;

    // Test connection
    const connected = await this.rpcManager.testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Base RPC');
    }

    await this.sleep(500);

    const wallet = this.rpcManager.createWallet(chainConfig.privateKey);
    const provider = wallet.provider;
    if (!provider) {
      throw new Error('Provider is null for Base');
    }

    await this.sleep(500);
    const balance = await provider.getBalance(wallet.address);

    // Get USDC balance
    const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    const usdcContract = new (await import('ethers')).Contract(
      USDC_ADDRESS,
      ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
      provider
    );

    let usdcBalance = 0;
    try {
      if (!usdcContract.balanceOf || !usdcContract.decimals) {
        throw new Error('USDC contract methods not available');
      }
      await this.sleep(500);
      const usdcBal = await usdcContract.balanceOf(wallet.address);
      await this.sleep(500);
      const decimals = await usdcContract.decimals();
      usdcBalance = Number(usdcBal) / (10 ** Number(decimals));
    } catch (error: any) {
      logger.warn('Failed to get USDC balance', {
        error: error?.message || error,
      });
    }

    logger.info('📡 BASE (Chain ID: 8453)');
    logger.info(`   👛 Wallet: ${wallet.address}`);
    logger.info(`   💰 ETH: ${(Number(balance) / 1e18).toFixed(4)} ETH`);
    logger.info(`   💵 USDC: $${usdcBalance.toFixed(2)}`);
    logger.info(`   📊 Protocols: ${chainConfig.protocols.join(', ')}`);
    logger.info(`   ⚙️  Min profit: $${chainConfig.minProfitUSD}`);
    logger.info(`   🔄 Scan interval: ${chainConfig.checkInterval / 1000}s`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    this.isRunning = true;

    // Retry USDC balance check after startup
    this.retryUSDCBalanceCheck();

    // Start monitoring loop
    this.startSummaryInterval();
    await this.monitorBase();
  }

  private async retryUSDCBalanceCheck(): Promise<void> {
    await this.sleep(10000);

    const chainConfig = this.config.baseConfig!;
    const wallet = this.rpcManager.createWallet(chainConfig.privateKey);
    const provider = wallet.provider;
    if (!provider) return;

    const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

    try {
      const { Contract } = await import('ethers');
      const usdcContract = new Contract(
        USDC_ADDRESS,
        ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
        provider
      );

      if (!usdcContract.balanceOf || !usdcContract.decimals) {
        throw new Error('USDC contract methods not available');
      }

      const usdcBal = await usdcContract.balanceOf(wallet.address);
      const decimals = await usdcContract.decimals();
      const usdcBalance = Number(usdcBal) / (10 ** Number(decimals));

      if (usdcBalance > 0) {
        logger.info(`💵 [BASE] USDC Balance Updated: $${usdcBalance.toFixed(2)}`);
      } else {
        logger.warn(`⚠️  [BASE] USDC balance is $0.00 - verify you have USDC in wallet ${wallet.address}`);
      }
    } catch (error: any) {
      logger.error('Failed to retry USDC balance check', {
        error: error?.message || error,
      });
    }
  }

  private async monitorBase(): Promise<void> {
    const chainConfig = this.config.baseConfig!;

    while (this.isRunning) {
      try {
        if (this.isExecutingLiquidation) {
          logger.debug('[BASE] Skipping scan - liquidation in progress');
        } else {
          await this.scanAndExecute();
        }
      } catch (error) {
        logger.error('Error in Base monitor loop', { error });

        this.metrics.consecutiveFailures++;
        if (this.metrics.consecutiveFailures >= this.config.maxConsecutiveFailures) {
          logger.warn('Max consecutive failures reached, pausing...');

          // Notify via Telegram
          await this.notifier.notifyBotPaused(
            'base',
            this.metrics.consecutiveFailures,
            this.config.pauseDuration
          );

          await this.sleep(this.config.pauseDuration * 1000);
          this.metrics.consecutiveFailures = 0;

          // Notify bot resumed
          await this.notifier.notifyBotResumed('base');
          logger.info('Bot resumed after pause');
        }
      }

      await this.sleep(chainConfig.checkInterval);
    }
  }

  private async updateETHPrice(): Promise<void> {
    const now = Date.now();

    // Skip update if recently updated
    if (now - this.ethPriceLastUpdated < this.ETH_PRICE_UPDATE_INTERVAL) {
      return;
    }

    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      const data = await response.json();

      if (data?.ethereum?.usd && typeof data.ethereum.usd === 'number') {
        const oldPrice = this.ethPriceUSD;
        this.ethPriceUSD = data.ethereum.usd;
        this.ethPriceLastUpdated = now;

        if (Math.abs(oldPrice - this.ethPriceUSD) / oldPrice > 0.05) {
          logger.info('📈 ETH price updated', {
            old: `$${oldPrice.toFixed(2)}`,
            new: `$${this.ethPriceUSD.toFixed(2)}`,
            change: `${((this.ethPriceUSD - oldPrice) / oldPrice * 100).toFixed(2)}%`
          });
        }
      }
    } catch (error) {
      logger.debug('Failed to update ETH price, using cached', {
        cached: `$${this.ethPriceUSD.toFixed(2)}`,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async scanAndExecute(): Promise<void> {
    const chainConfig = this.config.baseConfig!;

    // Update ETH price before scanning (for accurate gas cost calculations)
    await this.updateETHPrice();

    logger.info('🔍 [BASE] Scanning positions...');

    try {
      // Only scan AAVE protocol
      const opportunities = await this.scanAAVE(
        chainConfig.minProfitUSD,
        chainConfig.maxLiquidationSize
      );

      if (opportunities.length === 0) {
        logger.info('✅ [BASE] No opportunities found');
        return;
      }

      // In immediate execution mode, opportunities are already executed
      // So we just log the summary
      logger.info(`✅ [BASE] Scan complete: ${opportunities.length} opportunities processed`, {
        totalOpportunities: opportunities.length,
        mode: 'immediate-execution'
      });

    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      logger.error('Error scanning Base', { error });

      // Notify ALL scan errors immediately (para debug)
      this.metrics.consecutiveFailures++;
      await this.notifier.notifyCriticalError('base', 'Scan Error', errorMessage);
    }
  }

  private async scanAAVE(
    minProfitUSD: number,
    maxLiquidationSize: number
  ): Promise<LiquidationOpportunity[]> {
    const chainConfig = this.config.baseConfig!;
    const wallet = this.rpcManager.createWallet(chainConfig.privateKey);

    try {
      if (!this.aaveProtocol) {
        this.aaveProtocol = new AAVEv3Base(wallet, this.notifier, this.config.notifyOnlyExecutable);
      }

      const initialBlocks = parseInt(process.env.BASE_INITIAL_BLOCKS_TO_SCAN || '200');

      // Create callback for immediate execution
      const immediateExecutionCallback = async (opportunity: LiquidationOpportunity) => {
        // Check if blacklisted
        const now = Date.now();
        const failed = this.failedAttempts.get(opportunity.user);

        if (failed) {
          // If blacklisted and NOT expired, skip
          if (now - failed.lastAttempt <= this.BLACKLIST_DURATION) {
            if (failed.count >= this.MAX_FAILED_ATTEMPTS) {
              logger.debug('⏭️  Skipping blacklisted user', {
                user: opportunity.user,
                attempts: failed.count,
                timeRemaining: Math.ceil((this.BLACKLIST_DURATION - (now - failed.lastAttempt)) / 1000) + 's'
              });
              return false; // Skip this opportunity
            }
          } else {
            // Blacklist expired, remove from blacklist
            this.failedAttempts.delete(opportunity.user);
            logger.info('🔓 Removed user from blacklist', {
              user: opportunity.user,
              previousAttempts: failed.count,
              debtUSD: failed.debtUSD.toFixed(2)
            });
          }
        }

        // Execute immediately!
        logger.warn('🚀 IMMEDIATE EXECUTION - Found liquidatable user!', {
          user: opportunity.user,
          hf: opportunity.healthFactor.toFixed(4),
          profit: opportunity.netProfitUSD.toFixed(4)
        });

        await this.executeLiquidation(opportunity);
        return true; // Executed
      };

      const opportunities = await this.aaveProtocol.scanLiquidatablePositions(
        minProfitUSD,
        this.ethPriceUSD,
        initialBlocks,
        maxLiquidationSize,
        immediateExecutionCallback // Pass callback
      );

      // Filter out blacklisted users from final results (for logging purposes)
      const now = Date.now();
      const filtered = opportunities.filter(opp => {
        const failed = this.failedAttempts.get(opp.user);
        if (!failed) return true;

        // If blacklisted and blacklist expired, remove from blacklist
        if (now - failed.lastAttempt > this.BLACKLIST_DURATION) {
          this.failedAttempts.delete(opp.user);
          logger.info('🔓 Removed user from blacklist', {
            user: opp.user,
            previousAttempts: failed.count,
            debtUSD: failed.debtUSD.toFixed(2)
          });
          return true;
        }

        // Still blacklisted
        if (failed.count >= this.MAX_FAILED_ATTEMPTS) {
          logger.debug('⏭️  Skipping blacklisted user', {
            user: opp.user,
            attempts: failed.count,
            timeRemaining: Math.ceil((this.BLACKLIST_DURATION - (now - failed.lastAttempt)) / 1000) + 's',
            debtUSD: failed.debtUSD.toFixed(2)
          });
          return false;
        }

        return true;
      });

      if (filtered.length < opportunities.length) {
        logger.info(`🚫 Filtered ${opportunities.length - filtered.length} blacklisted opportunities`);
      }

      return filtered;

    } catch (error) {
      logger.error('Error scanning AAVE on Base', { error });
      return [];
    }
  }

  private async revalidateOpportunity(opportunity: LiquidationOpportunity, wallet: any): Promise<{
    isValid: boolean;
    reason?: string;
  }> {
    try {
      // Re-check user's health factor immediately before execution
      const { Contract } = await import('ethers');
      const { AAVE_POOL_ABI } = await import('./config/abis/index.ts');
      const pool = new Contract(AAVE_V3_POOL, AAVE_POOL_ABI, wallet);

      const accountData = await pool.getUserAccountData(opportunity.user);
      const healthFactor = Number(accountData[5]) / 1e18;

      if (healthFactor >= 1.0) {
        return {
          isValid: false,
          reason: `Health factor recovered to ${healthFactor.toFixed(4)} (user no longer liquidatable)`
        };
      }

      logger.debug('✅ Revalidation passed', {
        user: opportunity.user,
        currentHF: healthFactor.toFixed(4),
        originalHF: opportunity.healthFactor.toFixed(4)
      });

      return { isValid: true };
    } catch (error) {
      logger.warn('Failed to revalidate opportunity', { error });
      // If revalidation fails, allow execution (better to try than skip)
      return { isValid: true };
    }
  }

  private async executeLiquidation(opportunity: LiquidationOpportunity): Promise<void> {
    const chainConfig = this.config.baseConfig!;
    const wallet = this.rpcManager.createWallet(chainConfig.privateKey);

    logger.warn('⚡ Executing liquidation!', {
      protocol: opportunity.protocol,
      user: opportunity.user,
      estimatedProfit: opportunity.netProfitUSD.toFixed(2),
    });

    this.isExecutingLiquidation = true;
    logger.debug('🛑 Pausing scanning during liquidation execution');

    try {
      // CRITICAL: Revalidate opportunity before execution
      const revalidation = await this.revalidateOpportunity(opportunity, wallet);

      if (!revalidation.isValid) {
        logger.warn('❌ Opportunity invalidated before execution', {
          user: opportunity.user,
          reason: revalidation.reason
        });
        this.updateMetrics({
          success: false,
          chain: 'base',
          protocol: opportunity.protocol,
          error: `Invalidated: ${revalidation.reason}`,
          timestamp: new Date(),
        });
        return;
      }
      // Create DEX swapper
      const dexRouters = [
        '0x2626664c2603336E57B271c5C0b26F421741e481', // Uniswap V3
        '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', // Aerodrome
      ];
      const dexSwapper = new DEXSwapper(wallet, 'base', dexRouters, this.config.maxSlippage);

      // Create flash loan executor
      const executor = new FlashLoanExecutor(wallet, 'base', dexSwapper);

      // Simulate first if enabled
      if (this.config.simulateBeforeExecute) {
        logger.info('🔬 Simulating transaction...');
        const simulation = await executor.simulate(opportunity, AAVE_V3_POOL);

        if (!simulation.success) {
          logger.warn('⚠️  Simulation failed, skipping', { error: simulation.error });
          this.updateMetrics({
            success: false,
            chain: 'base',
            protocol: opportunity.protocol,
            error: 'Simulation failed: ' + simulation.error,
            timestamp: new Date(),
          });
          return;
        }

        logger.info('✅ Simulation successful');
      }

      // Execute liquidation with own capital
      const result = await executor.executeWithOwnCapital(opportunity, AAVE_V3_POOL);

      // Track failed attempts (for blacklisting constant recoveries)
      if (!result.success) {
        const error = result.error || '';
        const isRecovery = error.includes('recovered') || error.includes('HEALTH_FACTOR_NOT_BELOW_THRESHOLD');

        if (isRecovery) {
          const failed = this.failedAttempts.get(opportunity.user) || { count: 0, lastAttempt: 0, debtUSD: 0 };
          failed.count++;
          failed.lastAttempt = Date.now();
          failed.debtUSD = opportunity.netProfitUSD; // approximate debt
          this.failedAttempts.set(opportunity.user, failed);

          if (failed.count >= this.MAX_FAILED_ATTEMPTS) {
            logger.warn('🚫 User blacklisted for constant recovery', {
              user: opportunity.user,
              attempts: failed.count,
              blacklistDuration: this.BLACKLIST_DURATION / 1000 + 's',
              debtUSD: failed.debtUSD.toFixed(2),
              reason: 'Recovers in <100ms consistently'
            });
          }
        }
      } else {
        // Success - clear any blacklist
        this.failedAttempts.delete(opportunity.user);
      }

      // Update metrics
      this.updateMetrics(result);

      // Send notifications
      if (result.success && result.profit && result.profit >= this.config.notificationMinProfit) {
        await this.notifier.notifySuccess(result);
      } else if (!result.success) {
        await this.notifier.notifyFailure(result);
      }

      // Reset consecutive failures on success
      if (result.success) {
        this.metrics.consecutiveFailures = 0;
      }

    } catch (error: any) {
      const errorMessage = error?.message || error?.reason || String(error);

      logger.error('❌ Liquidation execution failed', {
        message: errorMessage,
        code: error?.code,
        shortMessage: error?.shortMessage,
        info: error?.info ? String(error.info) : undefined
      });

      this.updateMetrics({
        success: false,
        chain: 'base',
        protocol: opportunity.protocol,
        error: errorMessage,
        timestamp: new Date(),
      });
    } finally {
      this.isExecutingLiquidation = false;
      logger.debug('▶️  Resuming scanning after liquidation attempt');
    }
  }

  private updateMetrics(result: any): void {
    this.metrics.totalLiquidations++;

    if (result.success) {
      this.metrics.successfulLiquidations++;
      if (result.profit) {
        this.metrics.totalProfitUSD += result.profit;
      }
      if (result.gasCostUSD) {
        this.metrics.totalGasSpentUSD += result.gasCostUSD;
      }
    } else {
      this.metrics.failedLiquidations++;
      this.metrics.consecutiveFailures++;
    }

    this.metrics.successRate = this.metrics.totalLiquidations > 0
      ? (this.metrics.successfulLiquidations / this.metrics.totalLiquidations) * 100
      : 0;

    this.metrics.averageProfitPerLiquidation = this.metrics.successfulLiquidations > 0
      ? this.metrics.totalProfitUSD / this.metrics.successfulLiquidations
      : 0;

    logger.info('📊 Updated metrics', {
      totalLiquidations: this.metrics.totalLiquidations,
      successRate: this.metrics.successRate.toFixed(1) + '%',
      totalProfit: this.metrics.totalProfitUSD.toFixed(2),
    });
  }

  private startSummaryInterval(): void {
    const intervalMs = this.config.summaryIntervalHours * 60 * 60 * 1000;
    this.summaryInterval = setInterval(() => {
      this.sendSummary();
    }, intervalMs);
  }

  private async sendSummary(): Promise<void> {
    logger.info('📊 Sending summary report...');
    await this.notifier.sendSummary(this.metrics, undefined);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop(): void {
    logger.info('Stopping Base Liquidator...');
    this.isRunning = false;
    if (this.summaryInterval) {
      clearInterval(this.summaryInterval);
    }
  }
}

// Main entry point
async function main() {
  const liquidator = new BaseLiquidator();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('Received SIGINT signal');
    liquidator.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM signal');
    liquidator.stop();
    process.exit(0);
  });

  try {
    await liquidator.start();
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    logger.error('Fatal error in main', { error });

    // Try to send critical error notification
    try {
      const config = loadConfig();
      const notifier = new TelegramNotifier(
        config.telegramBotToken,
        config.telegramChatId,
        config.notificationMinProfit
      );
      await notifier.notifyCriticalError('base', 'Fatal Startup Error', errorMessage);
    } catch (notifyError) {
      // Ignore notification errors on fatal shutdown
      logger.debug('Failed to send critical error notification', { notifyError });
    }

    process.exit(1);
  }
}

main();
