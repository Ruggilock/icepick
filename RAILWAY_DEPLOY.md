# 🚂 Deploy Icepick en Railway

## ✅ Pre-requisitos

- ✅ Cuenta de Railway (https://railway.app)
- ✅ Redis ya configurado en Railway
- ✅ Repositorio en GitHub (https://github.com/Ruggilock/icepick)

---

## 🚀 Pasos para Deploy

### 1. Crear Nuevo Servicio en Railway

1. Ve a tu proyecto de Railway (donde tienes Redis)
2. Click en **"New Service"**
3. Selecciona **"GitHub Repo"**
4. Busca y selecciona el repo **`Ruggilock/icepick`**
5. Railway automáticamente detectará el `Dockerfile` y empezará a buildear

---

### 2. Configurar Variables de Entorno

En el servicio de Icepick, ve a **"Variables"** y agrega:

#### Chain Configuration
```bash
ACTIVE_CHAINS=linea
```

#### Linea Configuration
```bash
LINEA_RPC_URL=https://linea-mainnet.infura.io/v3/YOUR_INFURA_KEY
LINEA_PRIVATE_KEY=your_private_key_here
LINEA_PROTOCOLS=aave
LINEA_MIN_PROFIT=1.5
LINEA_MAX_LIQUIDATION_SIZE=100
LINEA_CHECK_INTERVAL=60000
LINEA_INITIAL_BLOCKS_TO_SCAN=200
LINEA_MAX_GAS_PRICE=0.1
LINEA_MAX_FEE_PER_GAS=0.05
LINEA_PRIORITY_FEE=0.01
LINEA_FLASHLOAN_PROVIDER=aave
```

#### Backup RPCs
```bash
LINEA_RPC_BACKUP_1=https://rpc.linea.build
LINEA_RPC_BACKUP_2=https://linea.blockpi.network/v1/rpc/public
```

#### Redis (IMPORTANTE - Usa el privado)
```bash
REDIS_URL=redis://default:OQYMMpNtfdDBUBUHibPnIaHeWGRXBHEd@redis.railway.internal:6379
```

#### Telegram (Opcional)
```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
NOTIFY_ONLY_EXECUTABLE=true
NOTIFICATION_MIN_PROFIT=5
SUMMARY_INTERVAL_HOURS=6
```

#### Global Settings
```bash
MAX_SLIPPAGE=2
SIMULATE_BEFORE_EXECUTE=true
MAX_CONSECUTIVE_FAILURES=5
PAUSE_DURATION=180
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_FILE_PATH=./logs/liquidator.log
```

---

### 3. Railway Auto-Connect a Redis

Railway automáticamente inyectará estas variables (NO las agregues manualmente):
- `REDISHOST` → `redis.railway.internal`
- `REDISPORT` → `6379`
- `REDISPASSWORD` → (tu password)
- `REDISUSER` → `default`

El bot usará `REDIS_URL` que apunta al Redis privado:
```
redis://default:password@redis.railway.internal:6379
```

---

### 4. Deploy y Monitoreo

1. **Deploy Automático**: Railway buildeará y deploará automáticamente
2. **Ver Logs**: Click en **"Deployments"** → Latest → **"View Logs"**
3. **Buscar en logs**:
   ```
   ✅ Redis connected
   📡 LINEA (Chain ID: 59144)
   👛 Wallet: 0x5Caf9AcE9C59f73502707D940BCF96AE355135a7
   💰 ETH: 0.0160 ETH
   💵 USDC: $99.82
   ```

---

## 🔍 Verificar que Redis Funciona

En los logs deberías ver:

```
[10:30:00] info  ✅ Redis connected
[10:30:15] debug Reserves loaded from Redis cache
[10:30:20] debug Price loaded from Redis cache
[10:30:25] debug Config loaded from Redis cache
```

Si ves estos mensajes, Redis está funcionando correctamente y reduciendo las llamadas RPC.

---

## 📊 Ventajas del Deploy en Railway

### ✅ Uptime 24/7
- El bot corre continuamente sin necesidad de tu computadora

### ✅ Redis Privado
- Usa `redis.railway.internal:6379` (más rápido que público)
- Latencia < 1ms entre el bot y Redis

### ✅ Logs Centralizados
- Todos los logs en Railway Dashboard
- Búsqueda y filtrado fácil

### ✅ Auto-Restart
- Si el bot se cae, Railway lo reinicia automáticamente
- Máximo 10 reintentos configurados en `railway.json`

### ✅ Notificaciones Telegram
- Recibes alertas de liquidaciones en tu teléfono
- Resumen cada 6 horas

---

## 🔧 Troubleshooting

### Bot no inicia

**Chequea logs** y busca errores de configuración:
```bash
Error: Linea is active but LINEA_RPC_URL or LINEA_PRIVATE_KEY is missing
```

**Solución**: Verifica que todas las variables de entorno estén configuradas.

### Redis no conecta

**Error en logs**:
```
Redis connection closed
```

**Solución**: Verifica que `REDIS_URL` apunta a `redis.railway.internal:6379`

### Rate Limiting de Infura

**Warning en logs**:
```
Rate limited on linea, trying backup RPC...
```

**Solución**: El bot automáticamente cambiará a `rpc.linea.build`. Si persiste, aumenta `LINEA_CHECK_INTERVAL` a 90000 (1.5 min).

### Balance USDC muestra $0.00

**Warning en logs**:
```
Failed to get USDC balance for linea
```

**Solución**: Es normal durante startup si hay rate limiting. El bot igualmente funcionará. El balance real se mostrará después del primer scan completo.

---

## 📈 Monitoreo de Performance

### Métricas de Redis

Puedes ver las stats de Redis en los logs:

```
[10:30:00] info  Redis Stats {"connected":true,"keysCount":45,"memoryUsed":"1.2M"}
```

### Métricas de Liquidaciones

El bot enviará resúmenes a Telegram cada 6 horas:

```
📊 Summary - LINEA (6 hours)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ Liquidations: 3 total (3 successful)
💰 Total Profit: $45.67
📈 Success Rate: 100%
⏱️  Uptime: 6.0 hours
```

---

## 🎯 Próximos Pasos

Una vez que el bot esté corriendo en Railway:

1. **Monitorea los primeros scans** (30-60 min)
   - ¿Encuentra borrowers?
   - ¿Redis está cacheando correctamente?

2. **Verifica consumo de Infura**
   - Con Redis, deberías estar en ~35-40K requests/día
   - Chequea https://infura.io/dashboard

3. **Ajusta configuración** según resultados
   - Si muy lento → Reduce `CHECK_INTERVAL` a 30s
   - Si rate limiting → Aumenta a 90s

4. **Scale up** si es rentable
   - Con $100-200 de capital inicial, evalúa si vale la pena invertir más
   - Con $500+ podrías usar QuickNode ($49/mes) para `CHECK_INTERVAL=15s`

---

## ✅ Checklist de Deploy

Antes de hacer commit y push:

- [ ] `railway.json` creado
- [ ] `.dockerignore` configurado
- [ ] Dockerfile funciona (`docker build -t icepick .`)
- [ ] Variables de entorno preparadas
- [ ] `REDIS_URL` apunta a Redis privado
- [ ] `LINEA_PRIVATE_KEY` lista
- [ ] Fondos en Linea (ETH + USDC)

---

## 🚀 Deploy Ahora

1. **Commit y push** todos los cambios:
   ```bash
   git add -A
   git commit -m "feat: add Railway deployment config with Redis integration"
   git push
   ```

2. **En Railway**:
   - New Service → GitHub Repo → `Ruggilock/icepick`
   - Configura variables de entorno
   - Deploy automático

3. **Monitorea logs** y espera a ver:
   ```
   ✅ Redis connected
   🚀 Multi-Chain Liquidation Bot Starting...
   📡 LINEA (Chain ID: 59144)
   ```

**¡Listo! El bot estará corriendo 24/7 en Railway con Redis privado.** 🎉
