import 'dotenv/config';
import { parseUnits } from 'ethers';
import type { BotConfig, ChainSpecificConfig, ChainName } from '../types/index.ts';

function loadBaseConfig(): ChainSpecificConfig | undefined {
  const rpcUrl = process.env.BASE_RPC_URL;
  const privateKey = process.env.BASE_PRIVATE_KEY;

  if (!rpcUrl || !privateKey) {
    return undefined;
  }

  return {
    privateKey,
    rpcUrl,
    rpcWsUrl: process.env.BASE_RPC_WS_URL,
    protocols: ['aave'], // Only AAVE for now
    minProfitUSD: parseFloat(process.env.BASE_MIN_PROFIT || '1.5'),
    maxLiquidationSize: parseFloat(process.env.BASE_MAX_LIQUIDATION_SIZE || '100'),
    checkInterval: parseInt(process.env.BASE_CHECK_INTERVAL || '12000'),
    maxGasPrice: parseFloat(process.env.BASE_MAX_GAS_PRICE || '0.5'),
    maxFeePerGas: parseFloat(process.env.BASE_MAX_FEE_PER_GAS || '0.05'),
    priorityFee: parseFloat(process.env.BASE_PRIORITY_FEE || '0.01'),
    flashLoanProvider: 'aave',
  };
}

export function loadConfig(): BotConfig {
  const baseConfig = loadBaseConfig();

  if (!baseConfig) {
    throw new Error('BASE_RPC_URL or BASE_PRIVATE_KEY is missing');
  }

  return {
    activeChains: ['base'],
    baseConfig,
    maxSlippage: parseFloat(process.env.MAX_SLIPPAGE || '2'),
    simulateBeforeExecute: process.env.SIMULATE_BEFORE_EXECUTE !== 'false',
    maxConsecutiveFailures: parseInt(process.env.MAX_CONSECUTIVE_FAILURES || '5'),
    pauseDuration: parseInt(process.env.PAUSE_DURATION || '180'),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    notificationMinProfit: parseFloat(process.env.NOTIFICATION_MIN_PROFIT || '5'),
    notifyOnlyExecutable: process.env.NOTIFY_ONLY_EXECUTABLE !== 'false',
    summaryIntervalHours: parseInt(process.env.SUMMARY_INTERVAL_HOURS || '6'),
  };
}

export function getGasConfig(config: ChainSpecificConfig) {
  return {
    maxFeePerGas: parseUnits(config.maxFeePerGas.toString(), 'gwei'),
    maxPriorityFeePerGas: parseUnits(config.priorityFee.toString(), 'gwei'),
    gasLimit: 800000n,
  };
}
