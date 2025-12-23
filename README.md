# Icepick - Multi-Chain DeFi Liquidation Bot

A sophisticated, automated liquidation bot for DeFi protocols on **Base** and **Arbitrum** chains. Icepick monitors lending protocols (AAVE v3, Moonwell, Radiant Capital, Compound v3, Silo Finance) and executes profitable liquidations using flash loans.

## Features

- ✅ **Multi-Chain Support**: Operates simultaneously on Base and Arbitrum
- ⚡ **Flash Loan Integration**: Uses AAVE v3 flash loans for zero-capital liquidations
- 🎯 **Protocol Priority**: Smart prioritization based on liquidation bonuses and competition
- 💰 **Profit Optimization**: Advanced profit calculation with gas, fees, and slippage
- 🔄 **Auto DEX Swapping**: Finds best swap routes across multiple DEXs
- 📱 **Telegram Notifications**: Real-time alerts and periodic summaries
- 🛡️ **Failover RPCs**: Automatic RPC switching on failures
- 🐳 **Docker Support**: Easy deployment with docker-compose

## Protocol Coverage

### Base (Chain ID: 8453)
- **AAVE v3** (5% bonus)
- **Moonwell** (8% bonus) - Priority target!
- **Compound v3** (5% bonus)

### Arbitrum (Chain ID: 42161)
- **Radiant Capital** (10% bonus) - Highest priority!
- **AAVE v3** (5% bonus)
- **Silo Finance** (7% bonus)
- **Compound v3** (5% bonus)

## Architecture

```
icepick/
├── src/
│   ├── index.ts                    # Main multi-chain coordinator
│   ├── chains/
│   │   ├── base/                   # Base chain configuration
│   │   │   ├── config.ts
│   │   │   └── protocols/
│   │   └── arbitrum/               # Arbitrum configuration
│   │       ├── config.ts
│   │       └── protocols/
│   ├── core/
│   │   ├── health-calculator.ts    # HF calculations
│   │   ├── profit-calculator.ts    # Profit estimation
│   │   └── dex-swapper.ts          # DEX integration
│   ├── utils/
│   │   ├── logger.ts               # Winston logger
│   │   ├── rpc-manager.ts          # RPC failover
│   │   └── notifications.ts        # Telegram bot
│   ├── types/                      # TypeScript types
│   └── config/                     # Configuration & ABIs
├── .env.example                    # Environment template
├── docker-compose.yml              # Docker setup
└── README.md                       # This file
```

## Quick Start

### Prerequisites

- **Bun** v1.2.9+ ([install](https://bun.sh))
- **Node.js** (optional, for compatibility)
- **Docker** (optional, for containerized deployment)
- Private keys for wallets on Base and/or Arbitrum
- RPC endpoints (Alchemy, Infura, or public)

### Installation

```bash
# Clone the repository
git clone <your-repo>
cd icepick

# Install dependencies
bun install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Configuration

Edit `.env` with your settings:

```bash
# Required for each chain
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
BASE_PRIVATE_KEY=your_private_key_here
BASE_MIN_PROFIT=1.5

ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
ARBITRUM_PRIVATE_KEY=your_private_key_here
ARBITRUM_MIN_PROFIT=2

# Optional: Telegram notifications
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

See [.env.example](.env.example) for all configuration options.

### Running the Bot

#### Development Mode

```bash
bun run dev
```

#### Production Mode

```bash
bun start
```

#### Docker Deployment

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## How It Works

### 1. Position Monitoring

The bot scans lending protocols every 12-15 seconds (configurable) to find users with:
- **Health Factor < 1.0** (liquidatable positions)
- Sufficient collateral to make liquidation profitable

### 2. Health Factor Calculation

```
HF = (Total Collateral × Liquidation Threshold) / Total Debt

HF < 1.0 = Liquidatable
```

### 3. Profit Estimation

For each liquidatable position, the bot calculates:

```
Gross Profit = Collateral Value - Debt Value
Flash Loan Fee = Debt × 0.09%
Gas Cost = Gas Used × Gas Price × ETH Price
Slippage Cost = Collateral Value × Slippage %

Net Profit = Gross Profit - Flash Loan Fee - Gas Cost - Slippage
```

Only executes if **Net Profit ≥ MIN_PROFIT_USD**

### 4. Flash Loan Execution

1. Request flash loan for debt amount
2. Repay user's debt to protocol
3. Receive collateral (with liquidation bonus)
4. Swap collateral to debt token on DEX
5. Repay flash loan + 0.09% fee
6. Keep the profit!

### 5. Priority System

Opportunities are prioritized by:
- **Net Profit** (higher = better)
- **Liquidation Bonus** (10% Radiant > 8% Moonwell > 5% AAVE)
- **Chain Competition** (Base has less competition than Arbitrum)
- **Health Factor Urgency** (HF < 0.95 gets priority)

## Gas Optimization

### Base
- Extremely low gas: ~0.001 - 0.05 gwei
- Lower profit threshold: $1.50
- Higher scan frequency: 12s

### Arbitrum
- Very low gas: ~0.01 - 0.1 gwei
- Standard profit threshold: $2.00
- Standard scan frequency: 15s

## Expected Performance

With $100-200 capital distributed across chains:

- **Daily Opportunities**: 10-30
- **Success Rate**: 60-80%
- **Daily Profit**: $15-40 (avg)
- **Best Case**: $50+ on high-value liquidations
- **Gas Efficiency**: <10% of profit

## Notifications

### Telegram Integration

The bot sends notifications for:

1. **Successful Liquidations** (profit ≥ $5)
```
✅ Liquidación exitosa!
Chain: BASE
Protocol: Moonwell
Profit: $18.50
TX: 0x...
```

2. **Failed Liquidations**
```
❌ Liquidación fallida
Reason: Front-run by competitor
Gas lost: $2.00
```

3. **Periodic Summaries** (every 6 hours)
```
📊 6-Hour Summary
BASE: 12✅ / 3❌ ($143 net)
ARBITRUM: 8✅ / 4❌ ($210 net)
COMBINED: $354 net profit
```

## Safety Features

- ✅ **Simulation Mode**: Test transactions before executing
- ✅ **Circuit Breaker**: Pause after N consecutive failures
- ✅ **RPC Failover**: Switch to backup RPCs automatically
- ✅ **Slippage Protection**: Max 2% slippage on swaps
- ✅ **Gas Limits**: Reject if gas too high
- ✅ **Profit Validation**: Only execute if profitable

## Advanced Configuration

### Protocol Selection

Choose which protocols to monitor per chain:

```bash
BASE_PROTOCOLS=aave,moonwell          # Skip Compound
ARBITRUM_PROTOCOLS=radiant,silo        # Focus on high-bonus
```

### Gas Configuration

Fine-tune gas settings:

```bash
BASE_MAX_FEE_PER_GAS=0.05      # 0.05 gwei
BASE_PRIORITY_FEE=0.01         # 0.01 gwei

ARBITRUM_MAX_FEE_PER_GAS=0.1
ARBITRUM_PRIORITY_FEE=0.01
```

### Scan Intervals

Adjust monitoring frequency:

```bash
BASE_CHECK_INTERVAL=10000       # 10 seconds (more aggressive)
ARBITRUM_CHECK_INTERVAL=20000   # 20 seconds (less aggressive)
```

## Troubleshooting

### Bot not finding opportunities

1. Lower `MIN_PROFIT_USD` threshold
2. Add more protocols to scan
3. Increase scan frequency
4. Check RPC connection

### Transactions failing

1. Ensure sufficient ETH for gas
2. Check slippage settings
3. Verify RPC is responding
4. Review contract addresses

### High gas costs

1. Increase `MAX_GAS_PRICE`
2. Use Type 2 EIP-1559 transactions
3. Monitor gas prices before executing

## Development Roadmap

### Phase 1: MVP ✅
- [x] Base + Arbitrum support
- [x] AAVE v3 integration
- [x] Flash loan executor
- [x] Basic notifications

### Phase 2: Protocol Expansion (In Progress)
- [ ] Moonwell full integration
- [ ] Radiant Capital integration
- [ ] Compound v3 integration
- [ ] Silo Finance integration

### Phase 3: Optimizations
- [ ] Mempool monitoring
- [ ] Dynamic gas bidding
- [ ] Multi-position batching
- [ ] Position prediction

### Phase 4: Advanced Features
- [ ] Web dashboard
- [ ] Prometheus metrics
- [ ] Auto-rebalancing
- [ ] ML-based profit prediction

## Security

⚠️ **Important Security Notes:**

- Never commit `.env` files
- Use separate wallets for the bot
- Start with small capital for testing
- Monitor bot activity closely
- Keep private keys secure

## License

MIT License

## Disclaimer

This software is for educational purposes. DeFi liquidation involves financial risk. Use at your own risk. The authors are not responsible for any financial losses.

---

**Built with ❄️ by the Icepick Team**
# icepick
