import { JsonRpcProvider, Wallet } from 'ethers';
import { logger } from './logger.ts';
import type { ChainName } from '../types/index.ts';

export class RPCManager {
  private provider: JsonRpcProvider;
  private backupProviders: JsonRpcProvider[];
  private currentProviderIndex: number = 0;
  private chain: ChainName;

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

  async testConnection(): Promise<boolean> {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      logger.info(`Connected to ${this.chain}`, { blockNumber });
      return true;
    } catch (error: any) {
      // Check if it's a rate limit error
      if (error?.error?.code === -32005 || error?.code === 'TOO_MANY_REQUESTS') {
        logger.warn(`Rate limited on ${this.chain}, trying backup RPC...`);
        // Try backup RPC
        if (await this.switchToBackup()) {
          return true;
        }
      }
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
