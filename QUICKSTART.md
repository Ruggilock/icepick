# Quick Start Guide - Icepick

Get your multi-chain liquidation bot running in 5 minutes.

## Prerequisites Check

Before starting, ensure you have:

- ✅ **Bun installed** (v1.2.9+)
  ```bash
  bun --version
  ```
  If not installed: `curl -fsSL https://bun.sh/install | bash`

- ✅ **RPC endpoints** (choose one):
  - [Alchemy](https://www.alchemy.com/) (recommended)
  - [Infura](https://www.infura.io/)
  - [QuickNode](https://www.quicknode.com/)
  - Public RPCs (free but rate-limited)

- ✅ **Wallets with private keys** for Base and/or Arbitrum
  - **IMPORTANT:** Use separate wallets for the bot, not your main wallet
  - Need ~$50-100 in ETH per chain for gas

- ✅ **Small capital** to start ($50-100 recommended for testing)

## Step 1: Clone & Install

```bash
# Navigate to your project directory
cd /Users/ruggi/Documents/defi/icepick

# Install dependencies (already done)
bun install

# Verify installation
bun run --help
```

## Step 2: Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit with your actual values
nano .env
```

**Minimum required configuration:**

```bash
# For Base only (simplest start)
ACTIVE_CHAINS=base

BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY_HERE
BASE_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
BASE_PROTOCOLS=aave
BASE_MIN_PROFIT=1
BASE_CHECK_INTERVAL=15000
```

**Save and exit** (Ctrl+X, then Y, then Enter in nano)

## Step 3: Test Connection

```bash
bun run test:connection
```

**Expected output:**
```
🧪 Testing RPC Connections...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📡 Testing BASE...
✅ Connected to base
   Chain ID: 8453
   Block Number: 12345678
   Gas Price: 0.00000001 ETH
   Wallet Address: 0x1234...
   Wallet Balance: 0.05 ETH
```

**If you see errors:**
- Check RPC URL is correct
- Check private key format (should start with 0x)
- Ensure wallet has ETH balance

## Step 4: Run the Bot

```bash
# Development mode (with auto-reload)
bun run dev

# OR production mode
bun start
```

**Expected output:**
```
🚀 Multi-Chain Liquidation Bot Starting...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📡 BASE (Chain ID: 8453)
   👛 Wallet: 0x1234...5678
   💰 Balance: 0.05 ETH
   📊 Protocols: aave
   ⚙️  Min profit: $1
   🔄 Scan interval: 15s

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[10:30:15] 🔍 [BASE] Scanning positions...
[10:30:17] ✅ [BASE] Scan complete
```

## Step 5: Enable Both Chains (Optional)

Once Base is working, add Arbitrum:

```bash
# Edit .env
ACTIVE_CHAINS=base,arbitrum

# Add Arbitrum config
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
ARBITRUM_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
ARBITRUM_PROTOCOLS=radiant,aave
ARBITRUM_MIN_PROFIT=2
```

Restart the bot:
```bash
bun start
```

## Step 6: Enable Telegram Notifications (Optional)

1. **Create a Telegram bot:**
   - Message [@BotFather](https://t.me/BotFather) on Telegram
   - Send `/newbot`
   - Follow prompts to create your bot
   - Save the bot token

2. **Get your chat ID:**
   - Message your bot
   - Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Find your `chat_id` in the JSON response

3. **Add to `.env`:**
   ```bash
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_CHAT_ID=987654321
   NOTIFICATION_MIN_PROFIT=5
   ```

4. **Restart bot** - you'll now get notifications!

## Troubleshooting

### "Error: Invalid private key"
- Ensure private key starts with `0x`
- Check for extra spaces or quotes
- Format: `0x1234567890abcdef...` (66 characters total)

### "Error: Insufficient funds"
- Your wallet needs ETH for gas
- Add at least 0.01 ETH to wallet
- Bridge ETH to Base/Arbitrum if needed

### "No opportunities found"
This is normal! Liquidations are rare. To test:
- Lower `MIN_PROFIT` to $0.10
- Increase `CHECK_INTERVAL` to scan more often
- Be patient - opportunities come in waves

### Bot crashes/restarts
- Check logs: `tail -f logs/liquidator.log`
- Verify RPC endpoint is working
- Check if you hit rate limits

## Monitoring Your Bot

### View Logs
```bash
# Real-time logs
tail -f logs/liquidator.log

# Search for errors
grep ERROR logs/liquidator.log

# Search for liquidations
grep "Liquidation" logs/liquidator.log
```

### Check Metrics
The bot logs metrics every 6 hours (configurable). Look for:
```
📊 6-Hour Summary
BASE: 5✅ / 2❌ ($47 net)
ARBITRUM: 3✅ / 1❌ ($68 net)
COMBINED: $115 net profit
```

## Docker Deployment (Production)

For 24/7 operation:

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f liquidation-bot

# Stop
docker-compose down

# Restart
docker-compose restart
```

## Safety Tips

1. **Start Small**
   - Begin with $50-100
   - Test for 24-48 hours
   - Scale up gradually

2. **Monitor Actively**
   - Check logs daily
   - Watch for errors
   - Verify profits are accumulating

3. **Set Limits**
   - Keep `MIN_PROFIT` reasonable ($1-2)
   - Set `MAX_GAS_PRICE` to avoid overpaying
   - Enable `SIMULATE_BEFORE_EXECUTE=true`

4. **Secure Your Keys**
   - Never commit `.env` to git
   - Use separate wallets for bot
   - Rotate keys periodically

## Next Steps

Once running successfully:

1. **Read [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)** - Learn how to add more protocols
2. **Optimize parameters** - Tune MIN_PROFIT, CHECK_INTERVAL for your needs
3. **Add more protocols** - Moonwell (8% bonus!), Radiant (10% bonus!)
4. **Monitor profitability** - Track daily profits and adjust strategy
5. **Scale up** - Add more capital as you gain confidence

## Getting Help

- **Logs showing errors?** Check `logs/liquidator.log`
- **Questions?** See [README.md](README.md) for detailed docs
- **Want to extend?** See [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)

## What's Happening Under the Hood

While running, the bot:

1. **Every 15 seconds** - Scans protocols for liquidatable positions
2. **Calculates profit** - Factors in gas, fees, slippage
3. **Executes if profitable** - Uses flash loans (zero capital!)
4. **Reports results** - Logs and Telegram notifications

**Current Status:** The bot is running in "scan mode". To actually execute liquidations, you need to implement the protocol scanners (see IMPLEMENTATION_GUIDE.md).

Good luck! 🚀❄️
