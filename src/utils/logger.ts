import winston from 'winston';
import type { ChainName } from '../types/index.ts';

const logLevel = process.env.LOG_LEVEL || 'info';
const logToFile = process.env.LOG_TO_FILE === 'true';
const logFilePath = process.env.LOG_FILE_PATH || './logs/liquidator.log';

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, chain, ...meta }) => {
        const chainPrefix = (chain && typeof chain === 'string') ? `[${chain.toUpperCase()}]` : '';
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level} ${chainPrefix} ${message}${metaStr}`;
      })
    ),
  }),
];

if (logToFile) {
  transports.push(
    new winston.transports.File({
      filename: logFilePath,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
}

export const logger = winston.createLogger({
  level: logLevel,
  transports,
});

export function logOpportunity(chain: ChainName, opp: any) {
  logger.warn('⚠️  Liquidation opportunity detected!', {
    chain,
    user: opp.user,
    protocol: opp.protocol,
    healthFactor: opp.healthFactor.toFixed(4),
    estimatedProfit: `$${opp.estimatedProfitUSD.toFixed(2)}`,
  });
}

export function logSuccess(chain: ChainName, result: any) {
  logger.info(`✅ [${chain.toUpperCase()}] LIQUIDATION SUCCESSFUL!`, {
    chain,
    profit: `$${result.profit?.toFixed(2)}`,
    txHash: result.txHash,
  });
}

export function logFailure(chain: ChainName, error: string) {
  logger.error(`❌ [${chain.toUpperCase()}] Liquidation failed`, {
    chain,
    error,
  });
}
