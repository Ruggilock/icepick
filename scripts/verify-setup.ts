#!/usr/bin/env bun

/**
 * Verification script to check if the bot is ready to run
 */

import { existsSync } from 'fs';
import { resolve } from 'path';

console.log('🔍 Verificando configuración del bot...\n');

let errors = 0;
let warnings = 0;

// Check .env file
console.log('1️⃣  Verificando archivo .env...');
if (!existsSync('.env')) {
  console.log('   ❌ ERROR: Archivo .env no encontrado');
  console.log('   💡 Solución: cp .env.example .env');
  errors++;
} else {
  console.log('   ✅ Archivo .env existe');

  // Check for required env vars
  const requiredVars = [
    'ACTIVE_CHAINS',
    'BASE_RPC_URL',
    'BASE_PRIVATE_KEY',
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      console.log(`   ⚠️  Variable ${varName} no configurada`);
      warnings++;
    }
  }
}

// Check source files
console.log('\n2️⃣  Verificando archivos fuente...');
const requiredFiles = [
  'src/index.ts',
  'src/chains/base/config.ts',
  'src/chains/base/protocols/aave-v3.ts',
  'src/chains/arbitrum/config.ts',
  'src/core/flashloan-executor.ts',
  'src/core/health-calculator.ts',
  'src/core/profit-calculator.ts',
  'src/core/dex-swapper.ts',
  'src/utils/logger.ts',
  'src/utils/rpc-manager.ts',
  'src/utils/notifications.ts',
  'src/config/index.ts',
  'src/config/abis/index.ts',
  'src/types/index.ts',
];

for (const file of requiredFiles) {
  if (existsSync(file)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - FALTA`);
    errors++;
  }
}

// Check directories
console.log('\n3️⃣  Verificando directorios...');
const requiredDirs = [
  'logs',
  'src/chains/base/protocols',
  'src/chains/arbitrum/protocols',
  'src/core',
  'src/utils',
  'src/config/abis',
];

for (const dir of requiredDirs) {
  if (existsSync(dir)) {
    console.log(`   ✅ ${dir}/`);
  } else {
    console.log(`   ⚠️  ${dir}/ no existe`);
    warnings++;
  }
}

// Check package.json scripts
console.log('\n4️⃣  Verificando scripts de package.json...');
try {
  const pkg = await Bun.file('package.json').json();
  const requiredScripts = ['start', 'dev', 'test:connection'];

  for (const script of requiredScripts) {
    if (pkg.scripts?.[script]) {
      console.log(`   ✅ npm run ${script}`);
    } else {
      console.log(`   ❌ npm run ${script} - FALTA`);
      errors++;
    }
  }
} catch (e) {
  console.log('   ❌ Error leyendo package.json');
  errors++;
}

// Check dependencies
console.log('\n5️⃣  Verificando dependencias...');
const requiredDeps = ['ethers', 'winston', 'dotenv'];
try {
  const pkg = await Bun.file('package.json').json();
  for (const dep of requiredDeps) {
    if (pkg.dependencies?.[dep]) {
      console.log(`   ✅ ${dep}`);
    } else {
      console.log(`   ❌ ${dep} - NO INSTALADO`);
      errors++;
    }
  }
} catch (e) {
  console.log('   ❌ Error verificando dependencias');
  errors++;
}

// Check node_modules
console.log('\n6️⃣  Verificando node_modules...');
if (existsSync('node_modules')) {
  console.log('   ✅ node_modules instalado');
} else {
  console.log('   ❌ node_modules no encontrado');
  console.log('   💡 Solución: bun install');
  errors++;
}

// Final report
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 RESUMEN DE VERIFICACIÓN');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (errors === 0 && warnings === 0) {
  console.log('✅ ¡TODO PERFECTO!');
  console.log('El bot está listo para ejecutarse.\n');
  console.log('Próximo paso:');
  console.log('  1. Fondea tu wallet con ETH y USDC');
  console.log('  2. Ejecuta: bun run test:connection');
  console.log('  3. Ejecuta: bun start\n');
  process.exit(0);
} else {
  if (errors > 0) {
    console.log(`❌ ${errors} error(es) encontrado(s)`);
  }
  if (warnings > 0) {
    console.log(`⚠️  ${warnings} advertencia(s)`);
  }
  console.log('\nPor favor, corrige los errores antes de continuar.\n');
  process.exit(1);
}
