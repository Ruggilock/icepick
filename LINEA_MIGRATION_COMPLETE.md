# ✅ Migración a Linea COMPLETADA

## 🎉 El Bot Ahora Funciona en Linea!

La migración de Base a Linea está **100% completa** y lista para usar.

---

## 📊 ¿Por Qué Linea?

### Comparación de Métricas (DefiLlama)

| Chain | Protocol | TVL | Fees (30d) | Competencia |
|-------|----------|-----|------------|-------------|
| **Base** | AAVE v3 | ~$500M+ | ~$200K+ | 🔴 EXTREMA |
| **Linea** | AAVE v3 | **$136.79M** | **$44,188** | 🟢 **MEDIA** |

### Ventajas de Linea

1. ✅ **3.7x más pequeño** que Base = Menos competencia
2. ✅ **Suficiente volumen** ($44K en fees/mes) = Muchas liquidaciones
3. ✅ **Infura soporta Linea** = RPC gratis funciona perfecto
4. ✅ **AAVE v3 oficial** = Mismo código que Base
5. ✅ **Chain nueva** = Menos bots profesionales

---

## 🔧 Archivos Creados/Modificados

### ✅ Nuevos Archivos

1. **`src/chains/linea/config.ts`**
   - AAVE v3 Pool: `0xc47b8C00b0f69a36fa203Ffeac0334874574a8Ac`
   - AAVE v3 Oracle: `0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156`
   - AAVE v3 Data Provider: `0x2b0fD22030046B06DC3aB8ca5Df7D90e5fD8bdAE`
   - USDC: `0x176211869cA2b568f2A7D4EE941E073a821EE1ff`
   - WETH: `0xe5D7C2a44FfDf6b295A15c148167daaAf5Cf34f`
   - Uniswap V3: `0x68b3465833fb72A70ecdf485E0e4c7bD8665Fc45`
   - PancakeSwap V3: `0x13f4EA83d0bD40E75C8222255bc855a974568Dd4`

2. **`src/chains/linea/protocols/aave-v3.ts`**
   - Clase `AAVEv3Linea` con todas las optimizaciones
   - Cache de precios, configs y reserves (1 min TTL)
   - Delays anti-rate-limit (250ms entre reserves, 5s entre usuarios)
   - Solo 5 usuarios por scan
   - Filtro de collaterals liquidables

### ✅ Archivos Modificados

1. **`src/types/index.ts`**
   - Agregado `'linea'` a `ChainName`
   - Agregado `lineaConfig` a `BotConfig`

2. **`src/config/index.ts`**
   - Soporte para `LINEA_*` env vars
   - Default chain cambiado a `'linea'`
   - Gas limit para Linea: 800000n

3. **`src/index.ts`**
   - Import de `AAVEv3Linea` y `LINEA_AAVE_POOL`
   - Soporte en todos los métodos:
     - `initializeChains()` - Inicializa RPC y métricas
     - `start()` - Muestra Chain ID 59144
     - `monitorChain()` - Loop de monitoreo
     - `scanAndExecute()` - Escaneo de posiciones
     - `scanProtocol()` - Usa `AAVEv3Linea` para Linea
     - `executeLiquidation()` - Usa `LINEA_AAVE_POOL`
     - `getDexRouters()` - Uniswap V3 + PancakeSwap V3
     - `sendSummary()` - Envía métricas de Linea

4. **`.env.example`**
   - `ACTIVE_CHAINS=linea` por defecto
   - Sección completa de configuración de Linea
   - Comentarios indicando que Linea es recomendado

---

## 🚀 Cómo Configurar y Usar

### 1. Configura tu `.env`

Copia `.env.example` a `.env` y actualiza:

```bash
# Chain activa
ACTIVE_CHAINS=linea

# === LINEA CONFIGURATION ===
LINEA_RPC_URL=https://linea-mainnet.infura.io/v3/TU_INFURA_KEY_AQUI
LINEA_PRIVATE_KEY=tu_private_key_aqui

# Protocol
LINEA_PROTOCOLS=aave

# Trading
LINEA_MIN_PROFIT=1.5
LINEA_MAX_LIQUIDATION_SIZE=100

# Timing
LINEA_CHECK_INTERVAL=60000  # 1 minuto (Infura Free Tier)
LINEA_INITIAL_BLOCKS_TO_SCAN=200

# Telegram (opcional pero recomendado)
TELEGRAM_BOT_TOKEN=tu_bot_token
TELEGRAM_CHAT_ID=tu_chat_id
NOTIFY_ONLY_EXECUTABLE=true
```

### 2. Bridge Fondos a Linea

Necesitas en tu wallet en Linea:
- **ETH**: ~$5-10 para gas
- **USDC**: $100+ para liquidaciones

**Bridge oficial**: https://bridge.linea.build/

### 3. Ejecuta el Bot

```bash
bun run dev
```

Deberías ver:
```
🚀 Multi-Chain Liquidation Bot Starting...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 LINEA (Chain ID: 59144)
   👛 Wallet: 0x...
   💰 ETH: 0.0050 ETH
   💵 USDC: $100.00
   📊 Protocols: aave
   ⚙️  Min profit: $1.5
   🔄 Scan interval: 60s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 📊 Consumo de Infura Free Tier

### Con Configuración Actual:

- **Usuarios por scan**: 5
- **Check interval**: 60s (1 minuto)
- **Requests por scan**: ~80
- **Requests por hora**: ~4,800
- **Requests por día**: ~115,000

### Tiempo Disponible:

```
100,000 requests/día ÷ 4,800 requests/hora = 20.8 horas/día
```

**El bot puede correr ~21 horas al día con Infura Free Tier!** ✅

Si necesitas 24/7:
- Reduce `CHECK_INTERVAL` a 90s → 24h/día disponible
- O usa backup RPC público cuando Infura se agote

---

## 🎯 Qué Esperar

### ✅ Logs Normales:

```
[10:30:00] info  🔍 [LINEA] Scanning positions...
[10:30:00] info  🔍 [AAVE v3 Linea] Scanning for liquidatable positions...
[10:30:01] info  Incremental scan {"fromBlock":5123456,"currentBlock":5123490,"newBlocks":34}
[10:30:02] info  Incremental scan complete: +3 new borrowers (total: 47)
[10:30:02] info  Checking 5 users for liquidation opportunities
[10:30:10] info  ✅ [LINEA] No opportunities found
```

### 🎯 Oportunidad Encontrada:

```
[10:35:15] warn  Found liquidatable position! {"user":"0x...","healthFactor":"0.9850","debtUSD":"245.67"}
[10:35:15] info  ✅ Profitable opportunity {"netProfit":"12.34","debtToCover":"122.84","bonus":"105.0%"}
[10:35:15] info  Found 1 profitable liquidation opportunities
[10:35:15] info  [LINEA] ⚡ Found 1 opportunities! {"bestProfit":"12.34"}
[10:35:15] warn  [LINEA] ⚡ Executing liquidation! {"protocol":"aave","user":"0x...","estimatedProfit":"12.34"}
```

---

## 🔄 Volver a Base/Arbitrum (Si Quieres)

El bot sigue soportando multi-chain. Para volver:

### Solo Base:
```bash
ACTIVE_CHAINS=base
```

### Solo Arbitrum:
```bash
ACTIVE_CHAINS=arbitrum
```

### Multi-chain (NO recomendado con Infura Free):
```bash
ACTIVE_CHAINS=linea,base
```

**Nota**: Con Infura Free Tier, es mejor usar **solo una chain** para no agotar requests.

---

## ✅ Checklist de Verificación

Antes de ejecutar, asegúrate de:

- [ ] `.env` configurado con `ACTIVE_CHAINS=linea`
- [ ] `LINEA_RPC_URL` con tu Infura API key
- [ ] `LINEA_PRIVATE_KEY` con tu private key
- [ ] Fondos en Linea (ETH + USDC)
- [ ] `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` (opcional)
- [ ] `bun run build` compila sin errores

---

## 📈 Próximos Pasos

Una vez corriendo en Linea:

1. **Monitorea los primeros scans** (30-60 min)
   - ¿Encuentra borrowers?
   - ¿Hay health factors < 1.0?

2. **Evalúa la competencia**
   - ¿Encuentras oportunidades?
   - ¿Se liquidan antes de que llegues?

3. **Ajusta configuración**
   - Si muy lento → Reduce `CHECK_INTERVAL` a 30s
   - Si rate limiting → Aumenta a 90s

4. **Considera upgrade**
   - Si funciona bien con $100-200, considera invertir más
   - Con $500+ puedes usar QuickNode Build ($49/mes) para CHECK_INTERVAL=15s

---

## 🎉 ¡Listo Para Usar!

La migración está **100% completa**. Solo necesitas:

1. Configurar `.env`
2. Bridge fondos a Linea
3. Ejecutar `bun run dev`

**El bot está optimizado para Linea con Infura Free Tier!** 🚀

---

## 📚 Referencias

- [AAVE v3 Linea Pool](https://lineascan.build/address/0xc47b8c00b0f69a36fa203ffeac0334874574a8ac)
- [Linea Bridge](https://bridge.linea.build/)
- [Infura Linea Documentation](https://docs.infura.io/networks/linea)
- [AAVE v3 Linea - DefiLlama](https://defillama.com/protocol/aave)
- [Linea Chain - DefiLlama](https://defillama.com/chain/linea)
