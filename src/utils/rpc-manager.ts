import { JsonRpcProvider, Wallet } from 'ethers';
import { logger } from './logger.ts';
import type { ChainName } from '../types/index.ts';

export class RPCManager {
  private provider: JsonRpcProvider;
  private backupProviders: JsonRpcProvider[];
  private currentProviderIndex: number = 0;
  private chain: ChainName;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000; // Start with 1s delay

  constructor(
    chain: ChainName,
    primaryRpc: string,
    backupRpcs: string[] = []
  ) {
    this.chain = chain;
    this.provider = new JsonRpcProvider(primaryRpc);
    this.backupProviders = backupRpcs.map(rpc => new JsonRpcProvider(rpc));
  }

  getProvider(): JsonRpcProvider {
    return this.provider;
  }

  /**
   * Execute RPC call with retry logic for transient errors
   * Handles temporary errors (code 19) and rate limits with exponential backoff
   */
  async withRetry<T>(fn: () => Promise<T>, context: string = 'RPC call'): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const errorCode = error?.info?.error?.code || error?.error?.code || error?.code;
        const errorMessage = error?.info?.error?.message || error?.error?.message || error?.message || String(error);

        // Check if it's a transient/temporary error (code 19)
        const isTemporary = errorCode === 19 || errorMessage.includes('Temporary internal error');

        // Check if it's a rate limit error
        const isRateLimit = errorCode === -32005 || error?.code === 'TOO_MANY_REQUESTS';

        if (isTemporary && attempt < this.MAX_RETRIES - 1) {
          const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt); // Exponential backoff
          logger.debug(`⏳ Temporary RPC error, retrying in ${delay}ms...`, {
            context,
            attempt: attempt + 1,
            maxRetries: this.MAX_RETRIES,
            errorCode,
            message: errorMessage
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        if (isRateLimit) {
          logger.warn(`⚠️  Rate limited on ${this.chain}, switching to backup RPC...`, {
            context,
            attempt: attempt + 1
          });
          if (await this.switchToBackup()) {
            // Retry with backup RPC
            continue;
          }
        }

        // For other errors or final attempt, throw
        if (attempt === this.MAX_RETRIES - 1) {
          logger.error(`❌ RPC call failed after ${this.MAX_RETRIES} attempts`, {
            context,
            error: errorMessage,
            errorCode
          });
        }
        throw error;
      }
    }

    throw lastError;
  }

  async testConnection(): Promise<boolean> {
    try {
      const blockNumber = await this.withRetry(
        () => this.provider.getBlockNumber(),
        'testConnection'
      );
      logger.info(`Connected to ${this.chain}`, { blockNumber });
      return true;
    } catch (error: any) {
      logger.error(`Failed to connect to ${this.chain}`, { error });
      return false;
    }
  }

  async switchToBackup(): Promise<boolean> {
    if (this.backupProviders.length === 0) {
      logger.error(`No backup RPCs available for ${this.chain}`);
      return false;
    }

    this.currentProviderIndex = (this.currentProviderIndex + 1) % this.backupProviders.length;
    this.provider = this.backupProviders[this.currentProviderIndex] || this.provider;

    logger.warn(`Switched to backup RPC for ${this.chain}`, {
      index: this.currentProviderIndex,
    });

    return await this.testConnection();
  }

  createWallet(privateKey: string): Wallet {
    return new Wallet(privateKey, this.provider);
  }
}
