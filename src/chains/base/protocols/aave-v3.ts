import { Contract, Wallet, formatUnits, parseUnits, Interface, WebSocketProvider } from 'ethers';
import { AAVE_POOL_ABI, AAVE_DATA_PROVIDER_ABI, AAVE_ORACLE_ABI, ERC20_ABI, MULTICALL3_ABI } from '../../../config/abis/index.ts';
import { AAVE_V3_POOL, AAVE_V3_POOL_DATA_PROVIDER, AAVE_V3_ORACLE, DEFAULT_CLOSE_FACTOR, AAVE_FLASH_LOAN_FEE, MULTICALL3_ADDRESS } from '../config.ts';
import { calculateHealthFactor, calculateMaxDebtToCover, calculateCollateralToReceive } from '../../../core/health-calculator.ts';
import { calculateProfit, calculatePriorityScore } from '../../../core/profit-calculator.ts';
import type { UserPosition, LiquidationOpportunity, CollateralAsset, DebtAsset } from '../../../types/index.ts';
import { logger } from '../../../utils/logger.ts';
import { redisClient } from '../../../utils/redis-client.ts';
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
  private multicall: Contract;
  private wsProvider?: WebSocketProvider;
  private wsConnected: boolean = false;

  // Cache to reduce API calls
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private configCache: Map<string, { config: any; timestamp: number }> = new Map();
  private reservesCache: { reserves: { symbol: string; address: string }[]; timestamp: number } | null = null;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  constructor(wallet: Wallet, telegramNotifier?: TelegramNotifier, notifyOnlyExecutable: boolean = true) {
    this.wallet = wallet;
    this.pool = new Contract(AAVE_V3_POOL, AAVE_POOL_ABI, wallet);
    this.dataProvider = new Contract(AAVE_V3_POOL_DATA_PROVIDER, AAVE_DATA_PROVIDER_ABI, wallet);
    this.oracle = new Contract(AAVE_V3_ORACLE, AAVE_ORACLE_ABI, wallet);
    this.multicall = new Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, wallet);
    this.telegramNotifier = telegramNotifier;
    this.notifyOnlyExecutable = notifyOnlyExecutable;

    // Load cached data from Redis
    this.loadFromRedis();

    // Initialize WebSocket monitoring
    this.initializeWebSocket();
  }

  /**
   * Load borrowers and last scanned block from Redis
   */
  private async loadFromRedis(): Promise<void> {
    try {
      const borrowers = await redisClient.get<string[]>('base:borrowers:set');
      if (borrowers && Array.isArray(borrowers)) {
        this.knownBorrowers = new Set(borrowers);
        logger.info(`Loaded ${borrowers.length} borrowers from Redis cache`);
      }

      const lastBlock = await redisClient.get<number>('base:last_scanned_block');
      if (lastBlock && typeof lastBlock === 'number') {
        this.lastScannedBlock = lastBlock;
        logger.info(`Loaded last scanned block from Redis: ${lastBlock}`);
      }
    } catch (error) {
      logger.debug('No Redis cache found, starting fresh', { error });
    }
  }

  /**
   * Save borrowers and last scanned block to Redis
   */
  private async saveToRedis(): Promise<void> {
    try {
      const borrowersArray = Array.from(this.knownBorrowers);
      await redisClient.set('base:borrowers:set', borrowersArray, 86400); // 24h TTL
      await redisClient.set('base:last_scanned_block', this.lastScannedBlock, 86400);
      logger.debug('Saved to Redis', {
        borrowers: borrowersArray.length,
        lastBlock: this.lastScannedBlock
      });
    } catch (error) {
      logger.debug('Failed to save to Redis', { error });
    }
  }

  /**
   * Initialize WebSocket connection for real-time Borrow event monitoring
   */
  private async initializeWebSocket(): Promise<void> {
    try {
      const wsUrl = process.env.BASE_RPC_WS_URL;
      if (!wsUrl) {
        logger.warn('BASE_RPC_WS_URL not configured - WebSocket monitoring disabled');
        return;
      }

      this.wsProvider = new WebSocketProvider(wsUrl);

      // Wait for WebSocket to be ready
      await this.wsProvider.ready;

      // Create a pool contract connected to WebSocket provider
      const wsPool = new Contract(AAVE_V3_POOL, AAVE_POOL_ABI, this.wsProvider);

      // Listen for Borrow events in real-time
      wsPool.on('Borrow', async (reserve: string, user: string, onBehalfOf: string, amount: bigint, interestRateMode: number, borrowRate: bigint, referral: number) => {
        if (!this.knownBorrowers.has(onBehalfOf)) {
          this.knownBorrowers.add(onBehalfOf);
          await this.saveToRedis();
          logger.info(`📡 [WebSocket] New borrower detected: ${onBehalfOf}`);
        }
      });

      this.wsConnected = true;
      logger.info('✅ WebSocket monitoring enabled for Borrow events');

      // Handle WebSocket errors and disconnections using the WebSocket object directly
      if ((this.wsProvider as any).websocket) {
        (this.wsProvider as any).websocket.on('error', (error: Error) => {
          logger.error('WebSocket error', { error: error.message });
          this.wsConnected = false;
        });

        (this.wsProvider as any).websocket.on('close', () => {
          logger.warn('WebSocket connection closed, attempting reconnect...');
          this.wsConnected = false;
          setTimeout(() => this.initializeWebSocket(), 5000);
        });
      }

    } catch (error) {
      logger.warn('Failed to initialize WebSocket', { error });
    }
  }

  /**
   * Get all reserve tokens in AAVE v3 on Base
   */
  async getAllReserves(): Promise<{ symbol: string; address: string }[]> {
    try {
      // Check in-memory cache first (reserves list rarely changes)
      if (this.reservesCache && Date.now() - this.reservesCache.timestamp < this.CACHE_TTL) {
        return this.reservesCache.reserves;
      }

      // Check Redis cache
      try {
        const cachedReserves = await redisClient.get<{ symbol: string; address: string }[]>('base:reserves:list');
        if (cachedReserves && Array.isArray(cachedReserves)) {
          this.reservesCache = { reserves: cachedReserves, timestamp: Date.now() };
          logger.debug('Loaded reserves list from Redis cache', { count: cachedReserves.length });
          return cachedReserves;
        }
      } catch (error) {
        logger.debug('Redis cache miss for reserves list', { error });
      }

      if (!this.dataProvider.getAllReservesTokens) {
        throw new Error('getAllReservesTokens not available');
      }

      const reserves = await this.dataProvider.getAllReservesTokens();
      const reservesList = reserves.map((r: any) => ({
        symbol: r.symbol,
        address: r.tokenAddress,
      }));

      // Cache the result in memory
      this.reservesCache = { reserves: reservesList, timestamp: Date.now() };

      // Cache in Redis (1 hour TTL - reserves rarely change)
      try {
        await redisClient.set('base:reserves:list', reservesList, 3600);
        logger.debug('Saved reserves list to Redis cache', { count: reservesList.length });
      } catch (error) {
        logger.debug('Failed to save reserves to Redis', { error });
      }

      return reservesList;
    } catch (error) {
      logger.error('Failed to get AAVE reserves', { error });
      return [];
    }
  }

  /**
   * Get user account data for multiple users in a single call using Multicall3
   * This is WAY faster than individual calls - 1 RPC call instead of N calls
   */
  async batchGetUserAccountData(userAddresses: string[]): Promise<Map<string, {
    totalCollateralBase: bigint;
    totalDebtBase: bigint;
    healthFactor: bigint;
  }>> {
    const results = new Map();

    try {
      if (userAddresses.length === 0) return results;

      // Prepare multicall calls
      const poolInterface = new Interface(AAVE_POOL_ABI);
      const calls = userAddresses.map(user => ({
        target: AAVE_V3_POOL,
        allowFailure: true,
        callData: poolInterface.encodeFunctionData('getUserAccountData', [user])
      }));

      // Execute multicall as a static call (read-only) - CRITICAL: must use staticCall for read operations
      if (!this.multicall.aggregate3) {
        throw new Error('Multicall3 aggregate3 not available');
      }

      const multicallResults = await this.multicall.aggregate3.staticCall(calls);

      // Decode results
      for (let i = 0; i < userAddresses.length; i++) {
        const result = multicallResults[i];
        if (result && result.success && result.returnData !== '0x') {
          try {
            const decoded = poolInterface.decodeFunctionResult('getUserAccountData', result.returnData);
            results.set(userAddresses[i]!, {
              totalCollateralBase: decoded[0],
              totalDebtBase: decoded[1],
              healthFactor: decoded[5],
            });
          } catch (error) {
            logger.debug(`Failed to decode data for user ${userAddresses[i]}`, { error });
          }
        }
      }

      logger.debug(`Multicall batch: ${results.size}/${userAddresses.length} users retrieved`);
      return results;

    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      logger.warn('Batch getUserAccountData failed, falling back to individual calls', { error: errorMessage });

      // Fallback: Try individual calls if Multicall3 fails
      for (let i = 0; i < userAddresses.length; i++) {
        const user = userAddresses[i];
        if (!user) continue;

        try {
          const data = await this.getUserAccountData(user);
          if (data) {
            results.set(user, data);
          }

          // Add delay between individual calls to avoid rate limiting
          if (i < userAddresses.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
          }
        } catch (individualError) {
          logger.debug(`Failed to get data for user ${user}`, { error: individualError });
        }
      }

      logger.info(`Fallback completed: ${results.size}/${userAddresses.length} users retrieved`);
      return results;
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
      // Check in-memory cache first
      const cached = this.priceCache.get(assetAddress);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.price;
      }

      // Check Redis cache (60s TTL for prices)
      try {
        const cachedPrice = await redisClient.get<number>(`base:price:${assetAddress}`);
        if (cachedPrice && typeof cachedPrice === 'number') {
          this.priceCache.set(assetAddress, { price: cachedPrice, timestamp: Date.now() });
          return cachedPrice;
        }
      } catch (error) {
        logger.debug('Redis cache miss for price', { asset: assetAddress });
      }

      if (!this.oracle.getAssetPrice) {
        throw new Error('getAssetPrice not available');
      }

      const price = await this.oracle.getAssetPrice(assetAddress);
      // AAVE oracle returns price in 8 decimals (USD)
      const priceValue = parseFloat(formatUnits(price, 8));

      // Cache the result in memory
      this.priceCache.set(assetAddress, { price: priceValue, timestamp: Date.now() });

      // Cache in Redis (60s TTL for fresh prices)
      try {
        await redisClient.set(`base:price:${assetAddress}`, priceValue, 60);
      } catch (error) {
        logger.debug('Failed to save price to Redis', { asset: assetAddress });
      }

      return priceValue;
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
      // Check cache first
      const cached = this.configCache.get(assetAddress);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.config;
      }

      if (!this.dataProvider.getReserveConfigurationData) {
        throw new Error('getReserveConfigurationData not available');
      }

      const config = await this.dataProvider.getReserveConfigurationData(assetAddress);
      const configValue = {
        decimals: Number(config[0]),
        ltv: Number(config[1]) / 10000, // Convert from basis points
        liquidationThreshold: Number(config[2]) / 10000,
        liquidationBonus: Number(config[3]) / 10000,
        isActive: config[7],
      };

      // Cache the result
      this.configCache.set(assetAddress, { config: configValue, timestamp: Date.now() });

      return configValue;
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
      // Small delay at the start to avoid request bursts
      await new Promise(resolve => setTimeout(resolve, 100));

      const provider = this.wallet.provider;
      if (!provider) {
        logger.error('Provider is null');
        return this.knownBorrowers;
      }

      const currentBlock = await provider.getBlockNumber();
      const CHUNK_SIZE = 10; // Infura Free Tier limit

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

            // Delay to avoid rate limiting (Infura Free Tier: 10 req/sec)
            if (i < totalChunks - 1) {
              await new Promise(resolve => setTimeout(resolve, 150)); // 150ms = ~6.6 req/sec (safe for Infura's 10 req/sec)
            }
          } catch (error) {
            logger.debug(`Error scanning chunk ${i}`, { fromBlock, toBlock, error });
          }
        }

        this.lastScannedBlock = currentBlock;
        await this.saveToRedis(); // Save after initial scan
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

            if (newUsers > 0) {
              await this.saveToRedis(); // Save if new borrowers found
            }
            logger.info(`Incremental scan complete: +${newUsers} new borrowers (total: ${this.knownBorrowers.size})`);
          } else {
            // If more than 10 blocks (e.g., bot was offline), chunk it
            const totalChunks = Math.ceil(blocksScanned / CHUNK_SIZE);
            let newUsers = 0;

            logger.debug(`Chunking ${blocksScanned} blocks into ${totalChunks} chunks`);

            for (let i = 0; i < totalChunks; i++) {
              const chunkFrom = fromBlock + (i * CHUNK_SIZE);
              const chunkTo = Math.min(chunkFrom + CHUNK_SIZE - 1, currentBlock);

              try {
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

                // Always delay between chunks to avoid rate limiting
                if (i < totalChunks - 1) {
                  await new Promise(resolve => setTimeout(resolve, 200)); // 200ms = 5 req/sec (safer for Infura)
                }
              } catch (error) {
                logger.debug(`Error scanning chunk ${i}/${totalChunks}`, { chunkFrom, chunkTo, error });
                // Continue to next chunk even if this one fails
              }
            }

            if (newUsers > 0) {
              await this.saveToRedis(); // Save if new borrowers found
            }
            logger.info(`Incremental scan complete: +${newUsers} new borrowers (total: ${this.knownBorrowers.size})`);
          }

          this.lastScannedBlock = currentBlock;
          await this.saveToRedis(); // Save updated block number
        }
      }

      return this.knownBorrowers;
    } catch (error) {
      logger.error('Failed to get users with debt', { error });

      // Update lastScannedBlock even on error to avoid getting stuck
      const provider = this.wallet.provider;
      if (provider) {
        try {
          const currentBlock = await provider.getBlockNumber();
          this.lastScannedBlock = currentBlock;
          logger.debug('Advanced lastScannedBlock despite error to avoid getting stuck', { newBlock: currentBlock });
        } catch (e) {
          // Ignore provider errors
        }
      }

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
      for (let i = 0; i < reserves.length; i++) {
        const reserve = reserves[i];
        if (!reserve) continue;

        const userReserve = await this.getUserReserveData(reserve.address, userAddress);
        if (!userReserve) {
          // Add small delay even if reserve check fails to avoid bursts
          if (i < reserves.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 150));
          }
          continue;
        }

        const price = await this.getAssetPrice(reserve.address);
        const config = await this.getReserveConfiguration(reserve.address);
        if (!config) {
          // Add small delay even if config fails
          if (i < reserves.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 150));
          }
          continue;
        }

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

        // Delay between reserves to avoid rate limiting
        // Each reserve makes 3 calls (getUserReserveData, getAssetPrice, getReserveConfiguration)
        // With Redis caching most calls are now cache hits, so we can reduce delay
        if (i < reserves.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50)); // Reduced from 250ms to 50ms
        }
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

    // Find best LIQUIDABLE collateral
    // Filter out collaterals that cannot be liquidated (liquidationThreshold = 0)
    const liquidableCollaterals: typeof position.collateralAssets = [];

    for (let i = 0; i < position.collateralAssets.length; i++) {
      const collateral = position.collateralAssets[i];
      if (!collateral) continue;

      const config = await this.getReserveConfiguration(collateral.asset);
      if (config && config.liquidationThreshold > 0) {
        liquidableCollaterals.push(collateral);
      }

      // Small delay to avoid rate limiting when checking multiple collaterals
      if (i < position.collateralAssets.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (liquidableCollaterals.length === 0) {
      logger.warn('User has no liquidable collateral', {
        user: position.user,
        totalCollaterals: position.collateralAssets.length
      });
      return null;
    }

    // Choose the collateral with highest value among liquidable ones
    const bestCollateral = liquidableCollaterals.reduce((max, c) =>
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

      // 2. Use Multicall3 to batch check ALL users in chunks of 10
      // Process all users, not just the first 10!
      const usersArray = Array.from(users);
      const BATCH_SIZE = 10; // Reduced from 15 to avoid RPC size limits with 2000+ users
      const liquidatableUsers: string[] = [];

      // Process in batches of 10 users
      const healthFactorSamples: number[] = [];
      type LowestHFUser = { address: string; hf: number; collateral: string; debt: string };
      let lowestHFUser: LowestHFUser | null = null;

      for (let i = 0; i < usersArray.length; i += BATCH_SIZE) {
        const batch = usersArray.slice(i, i + BATCH_SIZE);

        // Batch get account data for this chunk
        const batchData = await this.batchGetUserAccountData(batch);

        // Filter liquidatable users (HF < 1.0)
        batchData.forEach((data, user) => {
          const healthFactor = Number(formatUnits(data.healthFactor, 18));

          // Track user with lowest HF for debugging
          if (!lowestHFUser || healthFactor < lowestHFUser.hf) {
            lowestHFUser = {
              address: user,
              hf: healthFactor,
              collateral: formatUnits(data.totalCollateralBase, 8),
              debt: formatUnits(data.totalDebtBase, 8),
            };
          }

          // Collect samples for debugging (first 20 users)
          if (healthFactorSamples.length < 20) {
            healthFactorSamples.push(healthFactor);
          }

          if (healthFactor < 1.0 && data.totalDebtBase > 0n) {
            liquidatableUsers.push(user);
          }
        });

        // Small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < usersArray.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Log health factor statistics
      if (healthFactorSamples.length > 0) {
        const minHF = Math.min(...healthFactorSamples);
        const maxHF = Math.max(...healthFactorSamples);
        const avgHF = healthFactorSamples.reduce((a, b) => a + b, 0) / healthFactorSamples.length;
        const sortedHF = [...healthFactorSamples].sort((a, b) => a - b);

        logger.info(`📊 Health Factor Stats (sample of ${healthFactorSamples.length} users):`, {
          min: minHF.toFixed(4),
          max: maxHF > 1000 ? '∞' : maxHF.toFixed(4),
          avg: avgHF > 1000 ? '∞' : avgHF.toFixed(4),
          lowest5: sortedHF.slice(0, 5).map(hf => hf.toFixed(4)),
        });

        // Log user with lowest HF for inspection
        if (lowestHFUser !== null) {
          const user = lowestHFUser as LowestHFUser;
          if (user.hf < 10) {
            logger.info(`🎯 Lowest HF User:`, {
              address: user.address,
              healthFactor: user.hf.toFixed(4),
              collateral: `$${parseFloat(user.collateral).toFixed(2)}`,
              debt: `$${parseFloat(user.debt).toFixed(2)}`,
            });
          }
        }
      }

      logger.info(`Found ${liquidatableUsers.length} liquidatable users from ${usersArray.length} checked`);

      // 3. Get full positions for liquidatable users only
      for (let i = 0; i < liquidatableUsers.length; i++) {
        const user = liquidatableUsers[i];
        if (!user) continue;

        try {
          // Get full position
          const position = await this.getUserPosition(user);
          if (!position) continue;

          // Double-check if liquidatable
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

        // Small delay between detailed position checks
        // Much smaller now because batch check already filtered non-liquidatable users
        if (i < liquidatableUsers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100)); // Reduced from 5000ms to 100ms
        }
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
