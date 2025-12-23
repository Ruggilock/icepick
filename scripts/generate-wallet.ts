#!/usr/bin/env bun

/**
 * Generate a new wallet for the liquidation bot
 * NEVER use your main wallet for bots!
 */

import { Wallet } from 'ethers';

console.log('🔐 Generating new wallet for liquidation bot...\n');

const wallet = Wallet.createRandom();

console.log('✅ Wallet generated!\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📍 Address:', wallet.address);
console.log('🔑 Private Key:', wallet.privateKey);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('⚠️  IMPORTANT:');
console.log('1. SAVE this private key securely');
console.log('2. NEVER commit it to git');
console.log('3. Add it to your .env file:');
console.log(`   BASE_PRIVATE_KEY=${wallet.privateKey}\n`);

console.log('4. Fund this wallet with:');
console.log('   - ETH for gas (0.01-0.05 ETH)');
console.log('   - USDC for liquidations (50-100 USDC)\n');

console.log('5. Bridges to use:');
console.log('   - Base: https://bridge.base.org');
console.log('   - Arbitrum: https://bridge.arbitrum.io\n');
