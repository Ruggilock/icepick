# 🔌 Configuración Infura para ICEPICK

## ✅ Cambios Implementados para Infura

### 1. **Optimización de Rate Limiting**

Infura Free Tier tiene mejores límites que Alchemy:
- **10 requests/segundo** (vs 5 req/sec de Alchemy)
- **100,000 requests/día**

### 2. **Ajustes en el Código**

**Scan inicial (chunking):**
- Delay reducido de 200ms → **150ms** entre chunks
- Esto da ~6.6 req/sec (seguro para el límite de 10 req/sec)

**Verificación de usuarios:**
- Máximo **10 usuarios** por scan (reducido de 20)
- **3 segundos** de delay entre cada usuario
- Cada usuario hace ~15-20 llamadas, total ~5 req/sec

---

## 📝 Configuración .env para Infura

### Opción 1: Solo Base con Infura

```bash
# ============================================
# BASE CONFIGURATION con Infura
# ============================================

BASE_RPC_URL=https://base-mainnet.infura.io/v3/966c0e573c504346979f01cb13fd7c61
BASE_RPC_WS_URL=wss://base-mainnet.infura.io/ws/v3/966c0e573c504346979f01cb13fd7c61

# Backup RPCs (si Infura falla)
BASE_RPC_BACKUP_1=https://mainnet.base.org
BASE_RPC_BACKUP_2=https://base.gateway.tenderly.co

BASE_PRIVATE_KEY=tu_private_key_aqui

# Protocolos
BASE_PROTOCOLS=aave

# Min profit
BASE_MIN_PROFIT=1.5

# Max capital per liquidation (ajusta según tu USDC disponible)
BASE_MAX_LIQUIDATION_SIZE=100

# Scan interval (ms)
# Con Infura Free: 60000ms (1 min) RECOMENDADO para durar más tiempo
# Si quieres ser agresivo: 30000ms (30s) pero consumirás más rápido
BASE_CHECK_INTERVAL=60000

# Bloques a escanear en scan inicial
BASE_INITIAL_BLOCKS_TO_SCAN=100

# Gas config
BASE_MAX_GAS_PRICE=0.5
BASE_MAX_FEE_PER_GAS=0.05
BASE_PRIORITY_FEE=0.01

BASE_FLASHLOAN_PROVIDER=aave

# ============================================
# GLOBAL SETTINGS
# ============================================

ACTIVE_CHAINS=base
MAX_SLIPPAGE=2
SIMULATE_BEFORE_EXECUTE=true
MAX_CONSECUTIVE_FAILURES=5
PAUSE_DURATION=180

# ============================================
# NOTIFICATIONS
# ============================================

# Telegram (opcional)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Solo notificar oportunidades dentro de tu capital
NOTIFY_ONLY_EXECUTABLE=true

# Solo notificar liquidaciones exitosas con profit > $5
NOTIFICATION_MIN_PROFIT=5

# Resumen cada 6 horas
SUMMARY_INTERVAL_HOURS=6

# ============================================
# LOGGING
# ============================================

LOG_LEVEL=info
LOG_TO_FILE=true
LOG_FILE_PATH=./logs/liquidator.log
```

---

## 📊 Consumo Estimado con Infura Free Tier

### Con `CHECK_INTERVAL=60000` (1 minuto):

```
Scan inicial:
- 100 bloques = 10 chunks × 150ms = 1.5 segundos
- 10 requests para el scan

Verificación de usuarios:
- 10 usuarios máximo por scan
- ~15-20 calls por usuario = ~175 calls total
- Con 3 segundos de delay = ~30 segundos total

Total por scan: ~185 requests
Frequency: 1 scan/minuto = 60 scans/hora
Consumo: 185 × 60 = 11,100 requests/hora
```

**Con 100,000 requests/día:**
- 100,000 / 11,100 = **~9 horas** de uso continuo por día

**Estrategia recomendada:**
- Corre el bot en horarios específicos (ej: 3 horas en la mañana, 3 en la tarde, 3 en la noche)
- Esto te da cobertura durante todo el día sin consumir todos tus créditos

---

### Con `CHECK_INTERVAL=30000` (30 segundos) - MÁS AGRESIVO:

```
Total por scan: ~185 requests
Frequency: 2 scans/minuto = 120 scans/hora
Consumo: 185 × 120 = 22,200 requests/hora
```

**Con 100,000 requests/día:**
- 100,000 / 22,200 = **~4.5 horas** de uso continuo por día

---

## 🎯 Recomendaciones según tu Capital

### Si tienes $100 USDC:

**Configuración ULTRA conservadora:**
```bash
BASE_CHECK_INTERVAL=120000  # 2 minutos
BASE_INITIAL_BLOCKS_TO_SCAN=50
BASE_MAX_LIQUIDATION_SIZE=100
```

**Duración:** ~18 horas/día de uso continuo

---

### Si tienes $200-500 USDC:

**Configuración balanceada:**
```bash
BASE_CHECK_INTERVAL=60000   # 1 minuto
BASE_INITIAL_BLOCKS_TO_SCAN=100
BASE_MAX_LIQUIDATION_SIZE=500
```

**Duración:** ~9 horas/día de uso continuo

---

### Si tienes $500+ USDC:

**Configuración agresiva:**
```bash
BASE_CHECK_INTERVAL=30000   # 30 segundos
BASE_INITIAL_BLOCKS_TO_SCAN=200
BASE_MAX_LIQUIDATION_SIZE=1000
```

**Duración:** ~4.5 horas/día

**Recomendación:** A este nivel de capital, considera **pagar QuickNode Build ($49/mes)** para tener velocidad competitiva.

---

## ⚠️ Qué Hacer si Sigues Teniendo "Too Many Requests"

Si sigues viendo errores de rate limiting:

### 1. Aumenta el delay entre usuarios
En el código actual es 3 segundos. Puedes aumentarlo a 5 segundos:

```bash
# Edita src/chains/base/protocols/aave-v3.ts línea 645
await new Promise(resolve => setTimeout(resolve, 5000)); // 5 segundos
```

### 2. Reduce usuarios por scan
Actualmente son 10. Puedes reducir a 5:

```bash
# Edita src/chains/base/protocols/aave-v3.ts línea 576
const usersArray = Array.from(users).slice(0, 5); // Check max 5 users per scan
```

### 3. Aumenta CHECK_INTERVAL
```bash
BASE_CHECK_INTERVAL=120000  # 2 minutos entre scans
```

---

## 🚀 Siguientes Pasos

1. **Copia tu API key de Infura** en el `.env`
2. **Configura según tu capital** (usa las recomendaciones arriba)
3. **Reinicia el bot:**
   ```bash
   bun run start
   ```
4. **Monitorea el consumo** en https://app.infura.io/dashboard
5. **Ajusta delays** si sigues viendo errores de rate limiting

---

## 💡 Alternativa: Infura + Otras RPCs Gratis

Puedes combinar Infura con otras RPCs gratuitas para distribuir las llamadas:

```bash
BASE_RPC_URL=https://base-mainnet.infura.io/v3/TU_API_KEY
BASE_RPC_BACKUP_1=https://mainnet.base.org
BASE_RPC_BACKUP_2=https://base.gateway.tenderly.co
```

El bot automáticamente cambiará a backup si Infura falla.

---

## 📈 Upgrade Path

Cuando estés listo para competir seriamente:

| Capital | RPC Provider | Plan | Costo/mes | Velocidad | Competitividad |
|---------|--------------|------|-----------|-----------|----------------|
| $100 | Infura | Free | $0 | Lento (1-2 min) | <5% |
| $200-500 | QuickNode | Build | $49 | Moderado (10-30s) | 30-50% |
| $1000+ | QuickNode | Growth | $299 | Rápido (5-10s) | 70-90% |

**Mi recomendación:** Usa Infura Free hasta que tengas $500+ en capital, luego upgrade a QuickNode Build.
