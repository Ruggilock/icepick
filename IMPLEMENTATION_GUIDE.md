# Icepick - Implementation Guide

This guide walks you through completing the liquidation bot implementation. The foundation is built - now you need to add the protocol-specific logic.

## Current Status ✅

### Completed Components

1. **Project Structure** ✅
   - Multi-chain architecture (Base + Arbitrum)
   - TypeScript types and interfaces
   - Configuration system with .env support

2. **Core Utilities** ✅
   - Health factor calculator
   - Profit calculator with gas estimation
   - RPC manager with failover
   - DEX swapper (multi-DEX support)
   - Logger (Winston with file/console)
   - Telegram notifications

3. **Chain Configurations** ✅
   - Base: AAVE v3, Moonwell, Compound v3
   - Arbitrum: Radiant, AAVE v3, Silo, Compound v3
   - All contract addresses and ABIs

4. **Infrastructure** ✅
   - Docker & docker-compose
   - Environment configuration
   - Test connection script

## What You Need to Implement

### Phase 1: Protocol Scanners (Critical)

Each protocol needs a scanner class that finds liquidatable positions.

#### 1.1 AAVE v3 Scanner

File: `src/chains/base/protocols/aave-v3.ts` (partially done)

**What to add:**

```typescript
async scanLiquidatablePositions(): Promise<LiquidationOpportunity[]> {
  // 1. Get all reserves (assets)
  const reserves = await this.getAllReserves();

  // 2. For each reserve, find users with debt
  //    - Query events: Borrow, Repay, Withdraw
  //    - Build list of unique users

  // 3. For each user:
  //    - Check health factor
  //    - If HF < 1.0, calculate liquidation opportunity
  //    - Add to opportunities array

  // 4. Return sorted by profit
}
```

**How to find users with debt:**

Option A (Events - Recommended):
```typescript
// Get Borrow events from last N blocks
const borrowFilter = pool.filters.Borrow();
const events = await pool.queryFilter(borrowFilter, -10000); // Last ~10k blocks
const users = [...new Set(events.map(e => e.args.user))];
```

Option B (Subgraph - Faster):
```typescript
// Use AAVE subgraph on Base
const query = `{
  users(where: { borrowedReservesCount_gt: 0 }) {
    id
  }
}`;
```

#### 1.2 Moonwell Scanner

File: `src/chains/base/protocols/moonwell.ts` (to create)

Similar to AAVE but uses Compound-like interface:

```typescript
export class MoonwellBase {
  private comptroller: Contract;

  async scanLiquidatablePositions(): Promise<LiquidationOpportunity[]> {
    // 1. Get all markets (mTokens)
    const markets = await this.comptroller.getAllMarkets();

    // 2. For each market, get borrowers
    // 3. Check account liquidity
    // 4. If underwater, create opportunity
  }
}
```

#### 1.3 Radiant Capital Scanner

File: `src/chains/arbitrum/protocols/radiant.ts` (to create)

Nearly identical to AAVE v3 (same interface):

```typescript
export class RadiantArbitrum {
  // Same as AAVE v3 but with Radiant contracts
  // 10% liquidation bonus - highest priority!
}
```

### Phase 2: Flash Loan Executor

File: `src/core/flashloan-executor.ts` (to create)

This is the most critical component:

```typescript
export class FlashLoanExecutor {
  async executeWithFlashLoan(
    opportunity: LiquidationOpportunity
  ): Promise<LiquidationResult> {

    // 1. Encode callback data
    const params = encodeCallbackData({
      protocol: opportunity.protocol,
      user: opportunity.user,
      collateralAsset: opportunity.collateralAsset,
      debtAsset: opportunity.debtAsset,
      debtToCover: opportunity.debtToCover,
    });

    // 2. Call flash loan
    const tx = await aavePool.flashLoanSimple(
      this.wallet.address,  // receiver
      opportunity.debtAsset, // asset to borrow
      opportunity.debtToCover, // amount
      params, // callback data
      0 // referral
    );

    // 3. Wait for result
    const receipt = await tx.wait();

    // 4. Parse result and calculate actual profit
    return analyzeReceipt(receipt);
  }

  // This function is called by AAVE during flash loan
  async executeOperation(
    asset: string,
    amount: bigint,
    premium: bigint,
    initiator: string,
    params: string
  ): Promise<boolean> {

    // Decode params
    const decoded = decodeCallbackData(params);

    // 1. Liquidate the position
    await protocol.liquidate(
      decoded.collateralAsset,
      decoded.debtAsset,
      decoded.user,
      decoded.debtToCover
    );

    // 2. Swap collateral to debt token
    const swapped = await dexSwapper.swap(
      decoded.collateralAsset,
      decoded.debtAsset,
      collateralReceived
    );

    // 3. Approve AAVE to take back loan + premium
    const totalDebt = amount + premium;
    await approve(debtAsset, aavePool, totalDebt);

    // 4. Return true (funds will be pulled automatically)
    return true;
  }
}
```

**Important:** You'll need to deploy a smart contract for the flash loan callback, OR implement the callback logic in your bot (harder).

### Phase 3: Main Liquidator Logic

File: `src/index.ts` (currently simplified)

**Expand the `scanAndExecute` method:**

```typescript
private async scanAndExecute(chain: ChainName): Promise<void> {
  const chainConfig = this.getChainConfig(chain);

  // 1. Scan all protocols in parallel
  const opportunities = await Promise.all(
    chainConfig.protocols.map(protocol =>
      this.scanProtocol(chain, protocol)
    )
  );

  // 2. Flatten and sort by priority
  const allOpps = opportunities.flat();
  const sorted = this.prioritizeOpportunities(allOpps);

  // 3. Execute most profitable opportunity
  if (sorted.length > 0) {
    const best = sorted[0];

    if (best.netProfitUSD >= chainConfig.minProfitUSD) {
      await this.executeLiquidation(best);
    }
  }
}

private async executeLiquidation(
  opp: LiquidationOpportunity
): Promise<void> {

  logger.warn('Executing liquidation', { opp });

  // 1. Simulate if enabled
  if (this.config.simulateBeforeExecute) {
    const simulated = await this.simulate(opp);
    if (!simulated.success) {
      logger.warn('Simulation failed, skipping');
      return;
    }
  }

  // 2. Execute with flash loan
  const result = await this.flashLoanExecutor.execute(opp);

  // 3. Update metrics
  this.updateMetrics(opp.chain, result);

  // 4. Send notification
  if (result.success) {
    await this.notifier.notifySuccess(result);
  } else {
    await this.notifier.notifyFailure(result);
  }
}
```

### Phase 4: Gas Optimization

Create: `src/utils/gas-optimizer.ts`

```typescript
export class GasOptimizer {
  async getOptimalGasPrice(
    chain: ChainName
  ): Promise<{ maxFee: bigint; priorityFee: bigint }> {

    // 1. Get current gas prices
    const feeData = await provider.getFeeData();

    // 2. Check if within limits
    const maxAllowed = parseUnits(config.maxGasPrice.toString(), 'gwei');

    if (feeData.maxFeePerGas > maxAllowed) {
      throw new Error('Gas too high');
    }

    // 3. Add small premium for competition
    const premium = feeData.maxPriorityFeePerGas * 110n / 100n; // +10%

    return {
      maxFee: feeData.maxFeePerGas,
      priorityFee: premium,
    };
  }
}
```

## Testing Strategy

### 1. Test RPC Connections

```bash
bun run test:connection
```

This should show:
- ✅ Connected to Base/Arbitrum
- ✅ Wallet balance
- ✅ Current gas prices

### 2. Test Protocol Integration

Create `test-protocol.ts`:

```typescript
const aave = new AAVEv3Base(wallet);

// Test 1: Get reserves
const reserves = await aave.getAllReserves();
console.log('Reserves:', reserves);

// Test 2: Check a known liquidatable position
const userData = await aave.getUserAccountData('0x...');
console.log('User data:', userData);

// Test 3: Get asset prices
const ethPrice = await aave.getAssetPrice(WETH);
console.log('ETH Price:', ethPrice);
```

### 3. Test Profit Calculator

```typescript
const profit = calculateProfit({
  debtToCover: parseUnits('100', 6), // 100 USDC
  debtAssetPriceUSD: 1,
  collateralToReceive: parseUnits('0.05', 18), // 0.05 ETH
  collateralAssetPriceUSD: 2500,
  liquidationBonus: 0.05,
  flashLoanFee: 0.0009,
  gasEstimate: 500000n,
  gasPriceWei: parseUnits('0.05', 'gwei'),
  ethPriceUSD: 2500,
  swapSlippage: 0.02,
});

console.log('Net Profit:', profit.netProfitUSD);
```

### 4. Dry Run Mode

Add to config:

```bash
DRY_RUN=true  # Don't execute real transactions
```

## Common Issues & Solutions

### Issue 1: No opportunities found

**Likely causes:**
- No users are actually liquidatable right now
- MIN_PROFIT too high
- Not scanning enough users

**Solutions:**
1. Lower MIN_PROFIT to $0.50 for testing
2. Scan more blocks for events
3. Use subgraph to find all borrowers

### Issue 2: Transactions reverting

**Likely causes:**
- Health factor already > 1 (someone else liquidated first)
- Insufficient balance for gas
- Slippage too restrictive

**Solutions:**
1. Increase scan frequency
2. Add balance checks before execution
3. Increase max slippage to 3-5%

### Issue 3: Unprofitable after gas

**Likely causes:**
- Gas estimation too low
- Slippage higher than expected
- Flash loan fee not accounted for

**Solutions:**
1. Test on testnet first
2. Increase gas estimates by 20%
3. Only target positions with >$10 profit

## Advanced Features

### 1. Subgraph Integration

Use The Graph to find users faster:

```typescript
const query = `
  query {
    users(
      where: {
        healthFactor_lt: "1000000000000000000"  # < 1.0
      }
      orderBy: healthFactor
      orderDirection: asc
    ) {
      id
      collateral { value }
      borrows { value }
      healthFactor
    }
  }
`;
```

Base AAVE Subgraph: `https://api.thegraph.com/subgraphs/name/aave/protocol-v3-base`

### 2. Websocket Monitoring

Instead of polling, listen for events:

```typescript
pool.on('Borrow', async (user, asset, amount) => {
  // New borrow - check if user is now liquidatable
  const hf = await checkHealthFactor(user);
  if (hf < 1.0) {
    await executeLiquidation(user);
  }
});
```

### 3. Mempool Monitoring

Front-run competitors:

```typescript
provider.on('pending', async (txHash) => {
  const tx = await provider.getTransaction(txHash);

  // Is this a liquidation?
  if (isLiquidationTx(tx)) {
    // Try to front-run with higher gas
    await executeFaster(tx);
  }
});
```

## Next Steps

1. **Implement AAVE v3 scanner** - Start here, it's the most important
2. **Test on small positions** - Find $5-10 opportunities
3. **Add Moonwell support** - Higher bonuses!
4. **Deploy to testnet first** - Use Sepolia or Base Sepolia
5. **Add more protocols gradually** - Don't rush

## Resources

- [AAVE v3 Docs](https://docs.aave.com/developers/core-contracts/pool)
- [Moonwell Docs](https://docs.moonwell.fi/)
- [Radiant Docs](https://docs.radiant.capital/)
- [Base RPC](https://docs.base.org/tools/node-providers/)
- [Arbitrum RPC](https://docs.arbitrum.io/node-running/how-tos/running-a-full-node)

## Support

If you get stuck:

1. Check the logs: `tail -f logs/liquidator.log`
2. Test each component individually
3. Start with one protocol, one chain
4. Ask in Telegram/Discord communities

Good luck! 🚀
