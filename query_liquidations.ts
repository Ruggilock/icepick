import { Contract, JsonRpcProvider } from 'ethers';
import { AAVE_POOL_ABI } from './src/config/abis/index.ts';

const AAVE_V3_POOL = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
// Use your private RPC with higher limits
const RPC_URL = 'https://lb.drpc.live/base/Ap4dgQGgo0d5nHkx4pjkXN5f-zIs410R8JLchhdoDp16';

async function queryLiquidations(blocksBack: number = 1000) {
  const provider = new JsonRpcProvider(RPC_URL);
  const pool = new Contract(AAVE_V3_POOL, AAVE_POOL_ABI, provider);

  const currentBlock = await provider.getBlockNumber();
  const fromBlock = currentBlock - blocksBack;

  console.log(`Scanning liquidations from block ${fromBlock} to ${currentBlock} (${blocksBack} blocks)...`);

  const filter = pool.filters.LiquidationCall();
  const events = await pool.queryFilter(filter, fromBlock, currentBlock);

  console.log(`\n📊 Found ${events.length} liquidations in last ${blocksBack} blocks\n`);

  let totalDebtUSD = 0;

  events.forEach((event, idx) => {
    if ('args' in event && event.args) {
      const debtToCover = event.args[3];
      const debtUSD = parseFloat((Number(debtToCover) / 1e6).toFixed(2));
      totalDebtUSD += debtUSD;
      console.log(`${idx + 1}. Block ${event.blockNumber}: $${debtUSD} liquidated (user: ${event.args[2]})`);
    }
  });

  console.log(`\n💰 Total liquidated: $${totalDebtUSD.toFixed(2)}`);
  console.log(`📈 Average per liquidation: $${(totalDebtUSD / events.length).toFixed(2)}`);

  process.exit(0);
}

queryLiquidations(1000); // Last ~8 hours on Base (2sec blocks)
