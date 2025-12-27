#!/usr/bin/env bun

import { loadConfig } from '../src/config/index.ts';
import { RPCManager } from '../src/utils/rpc-manager.ts';
import { logger } from '../src/utils/logger.ts';
import { formatEther } from 'ethers';

async function testConnection() {
  logger.info('🧪 Testing RPC Connections...');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const config = loadConfig();

  for (const chain of config.activeChains) {
    const chainConfig = config.baseConfig;
    if (!chainConfig) {
      logger.warn(`⚠️  No configuration found for ${chain}`);
      continue;
    }

    logger.info(`\n📡 Testing ${chain.toUpperCase()}...`);

    const backupRpcs = [
      process.env[`${chain.toUpperCase()}_RPC_BACKUP_1`],
      process.env[`${chain.toUpperCase()}_RPC_BACKUP_2`],
    ].filter(Boolean) as string[];

    const rpcManager = new RPCManager(chain, chainConfig.rpcUrl, backupRpcs);

    // Test connection
    const connected = await rpcManager.testConnection();
    if (!connected) {
      logger.error(`❌ Failed to connect to ${chain}`);
      continue;
    }

    // Get provider info
    const provider = rpcManager.getProvider();
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    const gasPrice = await provider.getFeeData();

    logger.info(`✅ Connected to ${chain}`);
    logger.info(`   Chain ID: ${network.chainId}`);
    logger.info(`   Block Number: ${blockNumber}`);
    logger.info(`   Gas Price: ${formatEther(gasPrice.gasPrice || 0n)} ETH`);
    logger.info(`   Max Fee: ${formatEther(gasPrice.maxFeePerGas || 0n)} ETH`);

    // Test wallet
    const wallet = rpcManager.createWallet(chainConfig.privateKey);
    if (!wallet.provider) {
      logger.error(`   ❌ Provider is null for ${chain}`);
      continue;
    }
    const balance = await wallet.provider.getBalance(wallet.address);

    logger.info(`   Wallet Address: ${wallet.address}`);
    logger.info(`   Wallet Balance: ${formatEther(balance)} ETH`);

    if (balance === 0n) {
      logger.warn(`   ⚠️  Wallet has no balance! Add some ETH for gas.`);
    }
  }

  logger.info('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('✅ Connection test complete!');
}

testConnection().catch((error) => {
  logger.error('Test failed', { error });
  process.exit(1);
});
