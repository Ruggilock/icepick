import { Contract, Wallet, formatUnits, parseUnits } from 'ethers';
import { AAVE_POOL_ABI, AAVE_DATA_PROVIDER_ABI, AAVE_ORACLE_ABI, ERC20_ABI } from '../../../config/abis/index.ts';
import { AAVE_V3_POOL, AAVE_V3_POOL_DATA_PROVIDER, AAVE_V3_ORACLE, DEFAULT_CLOSE_FACTOR, AAVE_FLASH_LOAN_FEE } from '../config.ts';
import { calculateHealthFactor, calculateMaxDebtToCover, calculateCollateralToReceive } from '../../../core/health-calculator.ts';
import { calculateProfit, calculatePriorityScore } from '../../../core/profit-calculator.ts';
import type { UserPosition, LiquidationOpportunity, CollateralAsset, DebtAsset } from '../../../types/index.ts';
import { logger } from '../../../utils/logger.ts';
import type { TelegramNotifier } from '../../../utils/notifications.ts';

export class AAVEv3Base {
  private pool: Contract;
  private dataProvider: Contract;
  private oracle: Contract;
  private wallet: Wallet;
  private lastScannedBlock: number = 0;
  private knownBorrowers: Set<string> = new Set();
  private telegramNotifier?: TelegramNotifier;
  private notifyOnlyExecutable: boolean;

  constructor(wallet: Wallet, telegramNotifier?: TelegramNotifier, notifyOnlyExecutable: boolean = true) {
    this.wallet = wallet;
    this.pool = new Contract(AAVE_V3_POOL, AAVE_POOL_ABI, wallet);
    this.dataProvider = new Contract(AAVE_V3_POOL_DATA_PROVIDER, AAVE_DATA_PROVIDER_ABI, wallet);
    this.oracle = new Contract(AAVE_V3_ORACLE, AAVE_ORACLE_ABI, wallet);
    this.telegramNotifier = telegramNotifier;
    this.notifyOnlyExecutable = notifyOnlyExecutable;
  }

  /**
   * Get all reserve tokens in AAVE v3 on Base
   */
  async getAllReserves(): Promise<{ symbol: string; address: string }[]> {
    try {
      if (!this.dataProvider.getAllReservesTokens) {
        throw new Error('getAllReservesTokens not available');
      }

      const reserves = await this.dataProvider.getAllReservesTokens();
      return reserves.map((r: any) => ({
        symbol: r.symbol,
        address: r.tokenAddress,
      }));
    } catch (error) {
      logger.error('Failed to get AAVE reserves', { error });
      return [];
    }
  }

  /**
   * Get user account data (total collateral, debt, health factor)
   */
  async getUserAccountData(userAddress: string): Promise<{
    totalCollateralBase: bigint;
    totalDebtBase: bigint;
    healthFactor: bigint;
  } | null> {
    try {
      if (!this.pool.getUserAccountData) {
        throw new Error('getUserAccountData not available');
      }

      const data = await this.pool.getUserAccountData(userAddress);
      return {
        totalCollateralBase: data[0],
        totalDebtBase: data[1],
        healthFactor: data[5],
      };
    } catch (error) {
      logger.error('Failed to get user account data', { error, user: userAddress });
      return null;
    }
  }

  /**
   * Check if a user is liquidatable
   */
  async isLiquidatable(userAddress: string): Promise<boolean> {
    const accountData = await this.getUserAccountData(userAddress);
    if (!accountData) return false;

    // Health factor is in 18 decimals, < 1e18 means liquidatable
    return accountData.healthFactor < BigInt(1e18);
  }

  /**
   * Get asset price from AAVE oracle
   */
  async getAssetPrice(assetAddress: string): Promise<number> {
    try {
      if (!this.oracle.getAssetPrice) {
        throw new Error('getAssetPrice not available');
      }

      const price = await this.oracle.getAssetPrice(assetAddress);
      // AAVE oracle returns price in 8 decimals (USD)
      return parseFloat(formatUnits(price, 8));
    } catch (error) {
      logger.error('Failed to get asset price', { error, asset: assetAddress });
      return 0;
    }
  }

  /**
   * Get user reserve data for a specific asset
   */
  async getUserReserveData(assetAddress: string, userAddress: string) {
    try {
      if (!this.dataProvider.getUserReserveData) {
        throw new Error('getUserReserveData not available');
      }

      const data = await this.dataProvider.getUserReserveData(assetAddress, userAddress);
      return {
        currentATokenBalance: data[0],
        currentStableDebt: data[1],
        currentVariableDebt: data[2],
        usageAsCollateralEnabled: data[8],
      };
    } catch (error) {
      logger.error('Failed to get user reserve data', { error });
      return null;
    }
  }

  /**
   * Get reserve configuration (liquidation threshold, bonus, etc.)
   */
  async getReserveConfiguration(assetAddress: string) {
    try {
      if (!this.dataProvider.getReserveConfigurationData) {
        throw new Error('getReserveConfigurationData not available');
      }

      const config = await this.dataProvider.getReserveConfigurationData(assetAddress);
      return {
        decimals: Number(config[0]),
        ltv: Number(config[1]) / 10000, // Convert from basis points
        liquidationThreshold: Number(config[2]) / 10000,
        liquidationBonus: Number(config[3]) / 10000,
        isActive: config[7],
      };
    } catch (error) {
      logger.error('Failed to get reserve config', { error });
      return null;
    }
  }

  /**
   * Execute liquidation call
   */
  async liquidate(
    collateralAsset: string,
    debtAsset: string,
    user: string,
    debtToCover: bigint,
    receiveAToken: boolean = false
  ) {
    try {
      logger.info('Executing AAVE liquidation', {
        user,
        collateralAsset,
        debtAsset,
        debtToCover: debtToCover.toString(),
      });

      if (!this.pool.liquidationCall) {
        throw new Error('liquidationCall not available');
      }

      const tx = await this.pool.liquidationCall(
        collateralAsset,
        debtAsset,
        user,
        debtToCover,
        receiveAToken
      );

      const receipt = await tx.wait();
      return {
        success: true,
        txHash: receipt?.hash,
      };
    } catch (error) {
      logger.error('Liquidation failed', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Execute flash loan
   */
  async executeFlashLoan(
    asset: string,
    amount: bigint,
    params: string,
    receiverAddress: string
  ) {
    try {
      if (!this.pool.flashLoanSimple) {
        throw new Error('flashLoanSimple not available');
      }

      const tx = await this.pool.flashLoanSimple(
        receiverAddress,
        asset,
        amount,
        params,
        0 // referral code
      );

      const receipt = await tx.wait();
      return {
        success: true,
        txHash: receipt?.hash,
      };
    } catch (error) {
      logger.error('Flash loan failed', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Get users who have borrowed in recent blocks
   * This is the key method to find potential liquidation targets
   * Uses incremental scanning to save API calls
   * Chunks requests in batches of 10 blocks for Alchemy Free Tier
   */
  private async getUsersWithDebt(blocksToScan: number = 10000): Promise<Set<string>> {
    try {
      const provider = this.wallet.provider;
      if (!provider) {
        logger.error('Provider is null');
        return this.knownBorrowers;
      }

      const currentBlock = await provider.getBlockNumber();
      const CHUNK_SIZE = 10; // Alchemy Free Tier limit

      // First scan: get historical data in chunks
      if (this.lastScannedBlock === 0) {
        const startBlock = currentBlock - blocksToScan;
        const totalChunks = Math.ceil(blocksToScan / CHUNK_SIZE);

        logger.info('Initial scan for users with debt (chunked)', {
          startBlock,
          currentBlock,
          totalBlocks: blocksToScan,
          chunks: totalChunks
        });

        const borrowFilter = this.pool.filters.Borrow;
        if (!borrowFilter) {
          logger.error('Borrow filter is undefined');
          return this.knownBorrowers;
        }

        // Scan in chunks of 10 blocks
        for (let i = 0; i < totalChunks; i++) {
          const fromBlock = startBlock + (i * CHUNK_SIZE);
          const toBlock = Math.min(fromBlock + CHUNK_SIZE - 1, currentBlock);

          try {
            const borrowEvents = await this.pool.queryFilter(borrowFilter(), fromBlock, toBlock);

            for (const event of borrowEvents) {
              if ('args' in event && event.args && event.args.length >= 2) {
                const user = event.args[1];
                if (typeof user === 'string') {
                  this.knownBorrowers.add(user);
                }
              }
            }

            // Log progress every 100 chunks
            if ((i + 1) % 100 === 0 || i === totalChunks - 1) {
              logger.debug(`Scanned ${i + 1}/${totalChunks} chunks (${this.knownBorrowers.size} borrowers found)`);
            }

            // Delay to avoid rate limiting (Alchemy Free Tier: ~5 req/sec)
            if (i < totalChunks - 1) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          } catch (error) {
            logger.debug(`Error scanning chunk ${i}`, { fromBlock, toBlock, error });
          }
        }

        this.lastScannedBlock = currentBlock;
        logger.info(`Initial scan complete: ${this.knownBorrowers.size} unique borrowers`);
      } else {
        // Incremental scan: only new blocks since last scan
        const fromBlock = this.lastScannedBlock + 1;
        const blocksScanned = currentBlock - fromBlock + 1;

        if (blocksScanned > 0) {
          logger.info('Incremental scan', { fromBlock, currentBlock, newBlocks: blocksScanned });

          const borrowFilter = this.pool.filters.Borrow;
          if (!borrowFilter) {
            logger.error('Borrow filter is undefined');
            return this.knownBorrowers;
          }

          // If less than 10 blocks, scan directly
          if (blocksScanned <= CHUNK_SIZE) {
            const borrowEvents = await this.pool.queryFilter(borrowFilter(), fromBlock, currentBlock);

            let newUsers = 0;
            for (const event of borrowEvents) {
              if ('args' in event && event.args && event.args.length >= 2) {
                const user = event.args[1];
                if (typeof user === 'string' && !this.knownBorrowers.has(user)) {
                  this.knownBorrowers.add(user);
                  newUsers++;
                }
              }
            }

            logger.info(`Incremental scan complete: +${newUsers} new borrowers (total: ${this.knownBorrowers.size})`);
          } else {
            // If more than 10 blocks (e.g., bot was offline), chunk it
            const totalChunks = Math.ceil(blocksScanned / CHUNK_SIZE);
            let newUsers = 0;

            for (let i = 0; i < totalChunks; i++) {
              const chunkFrom = fromBlock + (i * CHUNK_SIZE);
              const chunkTo = Math.min(chunkFrom + CHUNK_SIZE - 1, currentBlock);

              const borrowEvents = await this.pool.queryFilter(borrowFilter(), chunkFrom, chunkTo);

              for (const event of borrowEvents) {
                if ('args' in event && event.args && event.args.length >= 2) {
                  const user = event.args[1];
                  if (typeof user === 'string' && !this.knownBorrowers.has(user)) {
                    this.knownBorrowers.add(user);
                    newUsers++;
                  }
                }
              }

              if (i < totalChunks - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
              }
            }

            logger.info(`Incremental scan complete: +${newUsers} new borrowers (total: ${this.knownBorrowers.size})`);
          }

          this.lastScannedBlock = currentBlock;
        }
      }

      return this.knownBorrowers;
    } catch (error) {
      logger.error('Failed to get users with debt', { error });
      return this.knownBorrowers;
    }
  }

  /**
   * Get detailed position for a user
   */
  private async getUserPosition(userAddress: string): Promise<UserPosition | null> {
    try {
      const accountData = await this.getUserAccountData(userAddress);
      if (!accountData || accountData.totalDebtBase === 0n) {
        return null;
      }

      const reserves = await this.getAllReserves();
      const collateralAssets: CollateralAsset[] = [];
      const debtAssets: DebtAsset[] = [];

      // Get user position for each reserve
      for (const reserve of reserves) {
        const userReserve = await this.getUserReserveData(reserve.address, userAddress);
        if (!userReserve) continue;

        const price = await this.getAssetPrice(reserve.address);
        const config = await this.getReserveConfiguration(reserve.address);
        if (!config) continue;

        // Check collateral
        if (userReserve.currentATokenBalance > 0n && userReserve.usageAsCollateralEnabled) {
          const valueUSD = parseFloat(formatUnits(userReserve.currentATokenBalance, config.decimals)) * price;
          collateralAssets.push({
            asset: reserve.address,
            symbol: reserve.symbol,
            balance: userReserve.currentATokenBalance,
            valueUSD,
            liquidationThreshold: config.liquidationThreshold,
          });
        }

        // Check debt
        const totalDebt = userReserve.currentStableDebt + userReserve.currentVariableDebt;
        if (totalDebt > 0n) {
          const valueUSD = parseFloat(formatUnits(totalDebt, config.decimals)) * price;
          debtAssets.push({
            asset: reserve.address,
            symbol: reserve.symbol,
            balance: totalDebt,
            valueUSD,
          });
        }

        // Small delay between reserves to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      const totalCollateralUSD = collateralAssets.reduce((sum, c) => sum + c.valueUSD, 0);
      const totalDebtUSD = debtAssets.reduce((sum, d) => sum + d.valueUSD, 0);

      // Calculate weighted average liquidation threshold
      const weightedThreshold = totalCollateralUSD > 0
        ? collateralAssets.reduce(
            (sum, c) => sum + (c.liquidationThreshold * c.valueUSD),
            0
          ) / totalCollateralUSD
        : 0;

      const healthFactor = calculateHealthFactor({
        totalCollateralUSD,
        totalDebtUSD,
        liquidationThreshold: weightedThreshold,
      });

      return {
        user: userAddress,
        chain: 'base',
        protocol: 'aave',
        healthFactor,
        totalCollateralUSD,
        totalDebtUSD,
        collateralAssets,
        debtAssets,
      };
    } catch (error) {
      logger.error('Failed to get user position', { error, user: userAddress });
      return null;
    }
  }

  /**
   * Calculate liquidation opportunity for a user
   */
  private async calculateOpportunity(
    position: UserPosition,
    minProfitUSD: number,
    ethPriceUSD: number
  ): Promise<LiquidationOpportunity | null> {
    if (position.healthFactor >= 1.0) {
      return null; // Not liquidatable
    }

    // Find best collateral and debt pair
    const bestCollateral = position.collateralAssets.reduce((max, c) =>
      c.valueUSD > max.valueUSD ? c : max
    );

    const bestDebt = position.debtAssets.reduce((max, d) =>
      d.valueUSD > max.valueUSD ? d : max
    );

    // Calculate max debt to cover (50% close factor)
    const debtToCover = calculateMaxDebtToCover(bestDebt.balance, DEFAULT_CLOSE_FACTOR);

    // Get asset prices and config
    const debtPrice = await this.getAssetPrice(bestDebt.asset);
    const collateralPrice = await this.getAssetPrice(bestCollateral.asset);
    const collateralConfig = await this.getReserveConfiguration(bestCollateral.asset);
    const debtConfig = await this.getReserveConfiguration(bestDebt.asset);

    if (!collateralConfig || !debtConfig) {
      return null;
    }

    // Calculate expected collateral
    const expectedCollateral = calculateCollateralToReceive(
      debtToCover,
      debtPrice,
      collateralPrice,
      collateralConfig.liquidationBonus,
      debtConfig.decimals,
      collateralConfig.decimals
    );

    // Estimate gas
    const gasEstimate = 800000n; // Typical liquidation gas
    const provider = this.wallet.provider;
    if (!provider) {
      return null;
    }
    const feeData = await provider.getFeeData();
    const gasPriceWei = feeData.maxFeePerGas || parseUnits('0.05', 'gwei');

    // Calculate profit
    const profitCalc = calculateProfit({
      debtToCover,
      debtAssetPriceUSD: debtPrice,
      collateralToReceive: expectedCollateral,
      collateralAssetPriceUSD: collateralPrice,
      liquidationBonus: collateralConfig.liquidationBonus,
      flashLoanFee: AAVE_FLASH_LOAN_FEE,
      gasEstimate,
      gasPriceWei,
      ethPriceUSD,
      swapSlippage: 0.02, // 2%
      debtDecimals: debtConfig.decimals,
      collateralDecimals: collateralConfig.decimals,
    });

    if (profitCalc.netProfitUSD < minProfitUSD) {
      return null; // Not profitable enough
    }

    const opportunity: LiquidationOpportunity = {
      user: position.user,
      chain: 'base',
      protocol: 'aave',
      debtAsset: bestDebt.asset,
      debtAssetSymbol: bestDebt.symbol,
      collateralAsset: bestCollateral.asset,
      collateralAssetSymbol: bestCollateral.symbol,
      debtToCover,
      expectedCollateral,
      liquidationBonus: collateralConfig.liquidationBonus,
      estimatedProfitUSD: profitCalc.grossProfitUSD,
      gasEstimate,
      gasCostUSD: profitCalc.gasCostUSD,
      netProfitUSD: profitCalc.netProfitUSD,
      profitable: profitCalc.profitable,
      healthFactor: position.healthFactor,
      priority: 0,
    };

    // Calculate priority score
    opportunity.priority = calculatePriorityScore(opportunity, 1.2); // Base has less competition

    return opportunity;
  }

  /**
   * Scan for liquidatable positions
   * This is the main entry point for finding opportunities
   */
  async scanLiquidatablePositions(
    minProfitUSD: number,
    ethPriceUSD: number,
    blocksToScan: number = 10000,
    maxLiquidationSize: number = 100
  ): Promise<LiquidationOpportunity[]> {
    logger.info('🔍 [AAVE v3 Base] Scanning for liquidatable positions...');

    const opportunities: LiquidationOpportunity[] = [];

    try {
      // 1. Get users with debt
      const users = await this.getUsersWithDebt(blocksToScan);

      logger.info(`Checking ${users.size} users for liquidation opportunities`);

      // 2. Check each user (limit to prevent rate limiting)
      // ULTRA CONSERVATIVE for Alchemy Free Tier: only check 20 users per scan
      const usersArray = Array.from(users).slice(0, 20); // Check max 20 users per scan

      for (const user of usersArray) {
        try {
          // Get full position
          const position = await this.getUserPosition(user);
          if (!position) continue;

          // Check if liquidatable
          if (position.healthFactor >= 1.0) continue;

          logger.warn('Found liquidatable position!', {
            user,
            healthFactor: position.healthFactor.toFixed(4),
            debtUSD: position.totalDebtUSD.toFixed(2),
          });

          // Calculate opportunity
          const opportunity = await this.calculateOpportunity(position, minProfitUSD, ethPriceUSD);
          if (opportunity) {
            // Filter by max liquidation size
            const debtToCoverUSD = parseFloat(formatUnits(opportunity.debtToCover, 6)) * 1; // Assuming USDC (6 decimals)
            const withinCapital = debtToCoverUSD <= maxLiquidationSize;

            // Send Telegram notification based on settings
            if (this.telegramNotifier) {
              // If notifyOnlyExecutable=true, only notify opportunities within capital
              // If notifyOnlyExecutable=false, notify ALL opportunities
              if (!this.notifyOnlyExecutable || withinCapital) {
                await this.telegramNotifier.notifyOpportunity(
                  'base',
                  'aave',
                  user,
                  position.healthFactor,
                  position.totalDebtUSD,
                  position.totalCollateralUSD,
                  opportunity.netProfitUSD,
                  withinCapital
                );
              }
            }

            if (!withinCapital) {
              logger.debug('Skipping opportunity - too large', {
                user,
                debtToCover: debtToCoverUSD.toFixed(2),
                maxSize: maxLiquidationSize
              });
              continue;
            }

            opportunities.push(opportunity);
            logger.info('✅ Profitable opportunity', {
              netProfit: opportunity.netProfitUSD.toFixed(2),
              debtToCover: debtToCoverUSD.toFixed(2),
              bonus: (opportunity.liquidationBonus * 100).toFixed(1) + '%',
            });
          }
        } catch (error) {
          logger.debug('Error checking user', { user, error });
        }

        // Delay to avoid rate limiting (Alchemy Free Tier: ~5 req/sec)
        // Each user check makes ~15-20 calls, so we need 5 seconds per user minimum
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // 3. Sort by priority
      opportunities.sort((a, b) => b.priority - a.priority);

      logger.info(`Found ${opportunities.length} profitable liquidation opportunities`);

      return opportunities;
    } catch (error) {
      logger.error('Error scanning positions', { error });
      return opportunities;
    }
  }
}
