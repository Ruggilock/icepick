import 'dotenv/config';
import { parseUnits } from 'ethers';
import type { BotConfig, ChainSpecificConfig, ChainName, ProtocolName } from '../types/index.ts';

function parseProtocols(str: string): ProtocolName[] {
  return str.split(',').map(p => p.trim() as ProtocolName).filter(Boolean);
}

function parseChains(str: string): ChainName[] {
  return str.split(',').map(c => c.trim() as ChainName).filter(Boolean);
}

function loadChainConfig(chain: 'BASE' | 'ARBITRUM'): ChainSpecificConfig | undefined {
  const rpcUrl = process.env[`${chain}_RPC_URL`];
  const privateKey = process.env[`${chain}_PRIVATE_KEY`];

  if (!rpcUrl || !privateKey) {
    return undefined;
  }

  return {
    privateKey,
    rpcUrl,
    rpcWsUrl: process.env[`${chain}_RPC_WS_URL`],
    protocols: parseProtocols(process.env[`${chain}_PROTOCOLS`] || 'aave'),
    minProfitUSD: parseFloat(process.env[`${chain}_MIN_PROFIT`] || '2'),
    maxLiquidationSize: parseFloat(process.env[`${chain}_MAX_LIQUIDATION_SIZE`] || '100'),
    checkInterval: parseInt(process.env[`${chain}_CHECK_INTERVAL`] || '15000'),
    maxGasPrice: parseFloat(process.env[`${chain}_MAX_GAS_PRICE`] || '1'),
    maxFeePerGas: parseFloat(process.env[`${chain}_MAX_FEE_PER_GAS`] || '0.1'),
    priorityFee: parseFloat(process.env[`${chain}_PRIORITY_FEE`] || '0.01'),
    flashLoanProvider: (process.env[`${chain}_FLASHLOAN_PROVIDER`] as 'aave' | 'balancer') || 'aave',
  };
}

export function loadConfig(): BotConfig {
  const activeChainsStr = process.env.ACTIVE_CHAINS || 'base';
  const activeChains = parseChains(activeChainsStr);

  if (activeChains.length === 0) {
    throw new Error('At least one chain must be active');
  }

  const baseConfig = activeChains.includes('base') ? loadChainConfig('BASE') : undefined;
  const arbitrumConfig = activeChains.includes('arbitrum') ? loadChainConfig('ARBITRUM') : undefined;

  if (activeChains.includes('base') && !baseConfig) {
    throw new Error('Base is active but BASE_RPC_URL or BASE_PRIVATE_KEY is missing');
  }

  if (activeChains.includes('arbitrum') && !arbitrumConfig) {
    throw new Error('Arbitrum is active but ARBITRUM_RPC_URL or ARBITRUM_PRIVATE_KEY is missing');
  }

  return {
    activeChains,
    baseConfig,
    arbitrumConfig,
    maxSlippage: parseFloat(process.env.MAX_SLIPPAGE || '2'),
    simulateBeforeExecute: process.env.SIMULATE_BEFORE_EXECUTE !== 'false',
    maxConsecutiveFailures: parseInt(process.env.MAX_CONSECUTIVE_FAILURES || '5'),
    pauseDuration: parseInt(process.env.PAUSE_DURATION || '180'),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    notificationMinProfit: parseFloat(process.env.NOTIFICATION_MIN_PROFIT || '5'),
    notifyOnlyExecutable: process.env.NOTIFY_ONLY_EXECUTABLE !== 'false', // Default: true
    summaryIntervalHours: parseInt(process.env.SUMMARY_INTERVAL_HOURS || '6'),
  };
}

export function getGasConfig(chain: ChainName, config: ChainSpecificConfig) {
  return {
    maxFeePerGas: parseUnits(config.maxFeePerGas.toString(), 'gwei'),
    maxPriorityFeePerGas: parseUnits(config.priorityFee.toString(), 'gwei'),
    gasLimit: chain === 'base' ? 800000n : 1000000n,
  };
}
