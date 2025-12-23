import { loadConfig } from './config/index.ts';
import { logger } from './utils/logger.ts';
import { RPCManager } from './utils/rpc-manager.ts';
import { TelegramNotifier } from './utils/notifications.ts';
import { DEXSwapper } from './core/dex-swapper.ts';
import { FlashLoanExecutor } from './core/flashloan-executor.ts';
import { AAVEv3Base } from './chains/base/protocols/aave-v3.ts';
import type { ChainName, ChainMetrics, LiquidationOpportunity, ProtocolName } from './types/index.ts';
import { AAVE_V3_POOL } from './chains/base/config.ts';
import { AAVE_V3_POOL as ARBITRUM_AAVE_POOL } from './chains/arbitrum/config.ts';

class MultiChainLiquidator {
  private config: ReturnType<typeof loadConfig>;
  private rpcManagers: Map<ChainName, RPCManager>;
  private notifier: TelegramNotifier;
  private metrics: Map<ChainName, ChainMetrics>;
  private isRunning: boolean = false;
  private summaryInterval?: Timer;
  private ethPriceUSD: number = 2500; // TODO: Get from oracle

  constructor() {
    this.config = loadConfig();
    this.rpcManagers = new Map();
    this.metrics = new Map();
    this.notifier = new TelegramNotifier(
      this.config.telegramBotToken,
      this.config.telegramChatId,
      this.config.notificationMinProfit
    );

    this.initializeChains();
  }

  private initializeChains(): void {
    for (const chain of this.config.activeChains) {
      const chainConfig = chain === 'base' ? this.config.baseConfig : this.config.arbitrumConfig;
      if (!chainConfig) continue;

      const backupRpcs = [
        process.env[`${chain.toUpperCase()}_RPC_BACKUP_1`],
        process.env[`${chain.toUpperCase()}_RPC_BACKUP_2`],
      ].filter((rpc): rpc is string => typeof rpc === 'string' && rpc.length > 0);

      const rpcManager = new RPCManager(chain, chainConfig.rpcUrl, backupRpcs);
      this.rpcManagers.set(chain, rpcManager);

      this.metrics.set(chain, {
        chain,
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
      });
    }
  }

  async start(): Promise<void> {
    logger.info('🚀 Multi-Chain Liquidation Bot Starting...');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Test connections
    for (const [chain, rpcManager] of this.rpcManagers) {
      const connected = await rpcManager.testConnection();
      if (!connected) {
        logger.error(`Failed to connect to ${chain}`);
        continue;
      }

      const chainConfig = chain === 'base' ? this.config.baseConfig : this.config.arbitrumConfig;
      if (!chainConfig) continue;

      const wallet = rpcManager.createWallet(chainConfig.privateKey);
      const provider = wallet.provider;
      if (!provider) {
        logger.error(`Provider is null for ${chain}`);
        continue;
      }

      const balance = await provider.getBalance(wallet.address);

      logger.info(`📡 ${chain.toUpperCase()} (Chain ID: ${chain === 'base' ? 8453 : 42161})`);
      logger.info(`   👛 Wallet: ${wallet.address}`);
      logger.info(`   💰 Balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`);
      logger.info(`   📊 Protocols: ${chainConfig.protocols.join(', ')}`);
      logger.info(`   ⚙️  Min profit: $${chainConfig.minProfitUSD}`);
      logger.info(`   🔄 Scan interval: ${chainConfig.checkInterval / 1000}s`);
    }

    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    this.isRunning = true;

    // Start monitoring loops for each chain
    const promises: Promise<void>[] = [];
    for (const chain of this.config.activeChains) {
      promises.push(this.monitorChain(chain));
    }

    // Start summary interval
    this.startSummaryInterval();

    await Promise.all(promises);
  }

  private async monitorChain(chain: ChainName): Promise<void> {
    const chainConfig = chain === 'base' ? this.config.baseConfig : this.config.arbitrumConfig;
    if (!chainConfig) return;

    while (this.isRunning) {
      try {
        await this.scanAndExecute(chain);
      } catch (error) {
        logger.error(`Error in ${chain} monitor loop`, { error });

        const metrics = this.metrics.get(chain);
        if (metrics) {
          metrics.consecutiveFailures++;
          if (metrics.consecutiveFailures >= this.config.maxConsecutiveFailures) {
            logger.warn(`Max consecutive failures reached for ${chain}, pausing...`);
            await this.sleep(this.config.pauseDuration * 1000);
            metrics.consecutiveFailures = 0;
          }
        }
      }

      await this.sleep(chainConfig.checkInterval);
    }
  }

  private async scanAndExecute(chain: ChainName): Promise<void> {
    const chainConfig = chain === 'base' ? this.config.baseConfig : this.config.arbitrumConfig;
    if (!chainConfig) return;

    const rpcManager = this.rpcManagers.get(chain);
    if (!rpcManager) return;

    logger.info(`🔍 [${chain.toUpperCase()}] Scanning positions...`, { chain });

    try {
      // Get opportunities from all protocols
      const allOpportunities: LiquidationOpportunity[] = [];

      for (const protocol of chainConfig.protocols) {
        const opportunities = await this.scanProtocol(chain, protocol, chainConfig.minProfitUSD);
        allOpportunities.push(...opportunities);
      }

      if (allOpportunities.length === 0) {
        logger.info(`✅ [${chain.toUpperCase()}] No opportunities found`, { chain });
        return;
      }

      // Sort by priority (highest first)
      allOpportunities.sort((a, b) => b.priority - a.priority);

      logger.info(`⚡ [${chain.toUpperCase()}] Found ${allOpportunities.length} opportunities!`, {
        chain,
        bestProfit: allOpportunities[0]?.netProfitUSD.toFixed(2),
      });

      // Execute the best opportunity
      const best = allOpportunities[0];
      if (best && best.netProfitUSD >= chainConfig.minProfitUSD) {
        await this.executeLiquidation(chain, best);
      }

    } catch (error) {
      logger.error(`Error scanning ${chain}`, { error });
    }
  }

  private async scanProtocol(
    chain: ChainName,
    protocol: ProtocolName,
    minProfitUSD: number
  ): Promise<LiquidationOpportunity[]> {
    const rpcManager = this.rpcManagers.get(chain);
    if (!rpcManager) return [];

    const chainConfig = chain === 'base' ? this.config.baseConfig : this.config.arbitrumConfig;
    if (!chainConfig) return [];

    const wallet = rpcManager.createWallet(chainConfig.privateKey);

    try {
      // Currently only AAVE v3 is implemented
      if (protocol === 'aave') {
        const aave = new AAVEv3Base(wallet);
        return await aave.scanLiquidatablePositions(minProfitUSD, this.ethPriceUSD);
      }

      // TODO: Implement other protocols (Moonwell, Radiant, etc.)
      logger.debug(`Protocol ${protocol} not yet implemented on ${chain}`);
      return [];

    } catch (error) {
      logger.error(`Error scanning ${protocol} on ${chain}`, { error });
      return [];
    }
  }

  private async executeLiquidation(
    chain: ChainName,
    opportunity: LiquidationOpportunity
  ): Promise<void> {
    const chainConfig = chain === 'base' ? this.config.baseConfig : this.config.arbitrumConfig;
    if (!chainConfig) return;

    const rpcManager = this.rpcManagers.get(chain);
    if (!rpcManager) return;

    const wallet = rpcManager.createWallet(chainConfig.privateKey);

    logger.warn('⚡ Executing liquidation!', {
      chain,
      protocol: opportunity.protocol,
      user: opportunity.user,
      estimatedProfit: opportunity.netProfitUSD.toFixed(2),
    });

    try {
      // Get pool address based on chain and protocol
      const poolAddress = chain === 'base' ? AAVE_V3_POOL : ARBITRUM_AAVE_POOL;

      // Create DEX swapper
      const dexRouters = this.getDexRouters(chain);
      const dexSwapper = new DEXSwapper(wallet, chain, dexRouters, this.config.maxSlippage);

      // Create flash loan executor
      const executor = new FlashLoanExecutor(wallet, chain, dexSwapper);

      // Simulate first if enabled
      if (this.config.simulateBeforeExecute) {
        logger.info('🔬 Simulating transaction...');
        const simulation = await executor.simulate(opportunity, poolAddress);

        if (!simulation.success) {
          logger.warn('⚠️  Simulation failed, skipping', { error: simulation.error });
          this.updateMetrics(chain, {
            success: false,
            chain,
            protocol: opportunity.protocol,
            error: 'Simulation failed: ' + simulation.error,
            timestamp: new Date(),
          });
          return;
        }

        logger.info('✅ Simulation successful');
      }

      // Execute liquidation with own capital (simpler, no flash loan contract needed)
      const result = await executor.executeWithOwnCapital(opportunity, poolAddress);

      // Update metrics
      this.updateMetrics(chain, result);

      // Send notifications
      if (result.success && result.profit && result.profit >= this.config.notificationMinProfit) {
        await this.notifier.notifySuccess(result);
      } else if (!result.success) {
        await this.notifier.notifyFailure(result);
      }

      // Reset consecutive failures on success
      if (result.success) {
        const metrics = this.metrics.get(chain);
        if (metrics) {
          metrics.consecutiveFailures = 0;
        }
      }

    } catch (error) {
      logger.error('❌ Liquidation execution failed', { error });

      this.updateMetrics(chain, {
        success: false,
        chain,
        protocol: opportunity.protocol,
        error: String(error),
        timestamp: new Date(),
      });
    }
  }

  private getDexRouters(chain: ChainName): string[] {
    if (chain === 'base') {
      return [
        '0x2626664c2603336E57B271c5C0b26F421741e481', // Uniswap V3
        '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', // Aerodrome
      ];
    } else {
      return [
        '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3
        '0xc873fEcbd354f5A56E00E710B90EF4201db2448d', // Camelot
      ];
    }
  }

  private updateMetrics(chain: ChainName, result: any): void {
    const metrics = this.metrics.get(chain);
    if (!metrics) return;

    metrics.totalLiquidations++;

    if (result.success) {
      metrics.successfulLiquidations++;
      if (result.profit) {
        metrics.totalProfitUSD += result.profit;
      }
      if (result.gasCostUSD) {
        metrics.totalGasSpentUSD += result.gasCostUSD;
      }
    } else {
      metrics.failedLiquidations++;
      metrics.consecutiveFailures++;
    }

    metrics.successRate = metrics.totalLiquidations > 0
      ? (metrics.successfulLiquidations / metrics.totalLiquidations) * 100
      : 0;

    metrics.averageProfitPerLiquidation = metrics.successfulLiquidations > 0
      ? metrics.totalProfitUSD / metrics.successfulLiquidations
      : 0;

    logger.info('📊 Updated metrics', {
      chain,
      totalLiquidations: metrics.totalLiquidations,
      successRate: metrics.successRate.toFixed(1) + '%',
      totalProfit: metrics.totalProfitUSD.toFixed(2),
    });
  }

  private startSummaryInterval(): void {
    const intervalMs = this.config.summaryIntervalHours * 60 * 60 * 1000;
    this.summaryInterval = setInterval(() => {
      this.sendSummary();
    }, intervalMs);
  }

  private async sendSummary(): Promise<void> {
    const baseMetrics = this.metrics.get('base');
    const arbitrumMetrics = this.metrics.get('arbitrum');

    logger.info('📊 Sending summary report...');
    await this.notifier.sendSummary(baseMetrics, arbitrumMetrics);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop(): void {
    logger.info('Stopping Multi-Chain Liquidator...');
    this.isRunning = false;
    if (this.summaryInterval) {
      clearInterval(this.summaryInterval);
    }
  }
}

// Main entry point
async function main() {
  const liquidator = new MultiChainLiquidator();

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
  } catch (error) {
    logger.error('Fatal error in main', { error });
    process.exit(1);
  }
}

main();
