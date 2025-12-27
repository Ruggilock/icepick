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
  private ethPriceUSD: number = 2500; // TODO: Get from oracle

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

  private async scanAndExecute(): Promise<void> {
    const chainConfig = this.config.baseConfig!;

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

      // Sort by priority (highest first)
      opportunities.sort((a, b) => b.priority - a.priority);

      logger.info(`⚡ [BASE] Found ${opportunities.length} opportunities!`, {
        bestProfit: opportunities[0]?.netProfitUSD.toFixed(2),
      });

      // Execute the best opportunity
      const best = opportunities[0];
      if (best && best.netProfitUSD >= chainConfig.minProfitUSD) {
        await this.executeLiquidation(best);
      }

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
      return await this.aaveProtocol.scanLiquidatablePositions(minProfitUSD, this.ethPriceUSD, initialBlocks, maxLiquidationSize);

    } catch (error) {
      logger.error('Error scanning AAVE on Base', { error });
      return [];
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
