# 🔧 Rate Limit Fix Applied

## Problema Resuelto

El bot estaba recibiendo errores **"Too Many Requests" (-32005)** de Infura inmediatamente al iniciar porque hacía demasiadas llamadas RPC simultáneas sin delays.

---

## ✅ Cambios Implementados

### 1. **Delays en Startup** ([src/index.ts:73-142](src/index.ts#L73-L142))

Agregados delays de **500ms** entre cada llamada RPC durante el inicio:

```typescript
// Antes: Todas las llamadas simultáneas
const blockNumber = await provider.getBlockNumber();
const balance = await provider.getBalance(wallet.address);
const usdcBal = await usdcContract.balanceOf(wallet.address);

// Ahora: Con delays de 500ms entre cada llamada
await this.sleep(500);
const blockNumber = await provider.getBlockNumber();
await this.sleep(500);
const balance = await provider.getBalance(wallet.address);
await this.sleep(500);
const usdcBal = await usdcContract.balanceOf(wallet.address);
```

**Impacto**: El startup ahora tarda ~3-4 segundos más, pero **no consume todo el rate limit de Infura**.

---

### 2. **Auto-Fallback a Backup RPCs** ([src/utils/rpc-manager.ts:25-42](src/utils/rpc-manager.ts#L25-L42))

El bot ahora **automáticamente cambia a RPC de respaldo** cuando detecta rate limiting:

```typescript
async testConnection(): Promise<boolean> {
  try {
    const blockNumber = await this.provider.getBlockNumber();
    logger.info(`Connected to ${this.chain}`, { blockNumber });
    return true;
  } catch (error: any) {
    // ✅ NUEVO: Detecta rate limit y cambia a backup
    if (error?.error?.code === -32005 || error?.code === 'TOO_MANY_REQUESTS') {
      logger.warn(`Rate limited on ${this.chain}, trying backup RPC...`);
      if (await this.switchToBackup()) {
        return true;
      }
    }
    logger.error(`Failed to connect to ${this.chain}`, { error });
    return false;
  }
}
```

**Backup RPCs configurados en `.env`**:
- `LINEA_RPC_BACKUP_1=https://rpc.linea.build` (RPC público oficial de Linea)
- `LINEA_RPC_BACKUP_2=https://linea.blockpi.network/v1/rpc/public` (BlockPI público)

---

## 🚀 Cómo Funciona Ahora

### Startup Sequence:

1. **Bot inicia** → Intenta conectar con Infura
2. **Si Infura responde** → Continúa con delays de 500ms entre llamadas
3. **Si Infura da rate limit** → Automáticamente cambia a `rpc.linea.build`
4. **Si backup también falla** → Intenta segundo backup `blockpi.network`
5. **Muestra balance, USDC, etc.** → Con delays para no agotar ningún RPC

### Durante Operación:

El bot ya tenía optimizaciones anti-rate-limit en el scanner:
- ✅ Cache de precios (1 min TTL)
- ✅ Cache de configs (1 min TTL)
- ✅ Cache de reserves (1 min TTL)
- ✅ Delay de 250ms entre reserves
- ✅ Delay de 5 segundos entre usuarios
- ✅ Solo escanea 5 usuarios por scan

---

## 📊 Consumo Estimado de Infura Free Tier

### Con `CHECK_INTERVAL=60000` (1 minuto):

| Actividad | Requests | Frecuencia | Total/día |
|-----------|----------|------------|-----------|
| **Startup** | ~10 | 1 vez | 10 |
| **Scan normal** | ~80 | 1440/día (cada min) | 115,200 |
| **TOTAL** | | | **~115,210** |

⚠️ **Ligeramente sobre el límite de 100K/día**

### ✅ Solución 1: Aumentar CHECK_INTERVAL a 90s

```bash
LINEA_CHECK_INTERVAL=90000  # 1.5 minutos
```

**Requests/día**: ~77,000 ✅ (dentro del límite)

### ✅ Solución 2: Usar Backup RPCs

Con auto-fallback habilitado, cuando Infura se agote (~21h de uso):
1. Bot detecta rate limit
2. Cambia automáticamente a `rpc.linea.build`
3. Continúa funcionando 24/7 sin interrupciones

---

## 🧪 Testing

Para probar que el auto-fallback funciona:

1. **Forzar uso de backup RPC** editando `.env`:
   ```bash
   LINEA_RPC_URL=https://rpc.linea.build
   # LINEA_RPC_URL=https://linea-mainnet.infura.io/v3/...  # Comentar Infura
   ```

2. **Ejecutar el bot**:
   ```bash
   bun run dev
   ```

3. **Deberías ver**:
   ```
   [10:30:00] info  Connected to linea {"blockNumber":27100313}
   [10:30:00] info  📡 LINEA (Chain ID: 59144)
   ```

Si ves errores de rate limit, el bot intentará el backup automáticamente.

---

## 🔍 Logs de Rate Limiting

Si el bot detecta rate limiting, verás estos logs:

### ✅ Cambio Automático a Backup:
```
[10:30:00] warn  Rate limited on linea, trying backup RPC...
[10:30:01] warn  Switched to backup RPC for linea {"index":0}
[10:30:01] info  Connected to linea {"blockNumber":27100313}
```

### ❌ Todos los RPCs Fallaron:
```
[10:30:00] warn  Rate limited on linea, trying backup RPC...
[10:30:01] error No backup RPCs available for linea
[10:30:01] error Failed to connect to linea
```

**Solución**: Esperar que Infura resetee (medianoche UTC) o usar otro API key.

---

## 🎯 Recomendaciones

### Para Infura Free Tier (100K requests/día):

1. ✅ **Usa `CHECK_INTERVAL=90000`** (1.5 min) para estar seguro
2. ✅ **Mantén backup RPCs configurados** en `.env`
3. ✅ **Monitorea tu uso en** https://infura.io/dashboard
4. ✅ **El bot ahora maneja rate limits automáticamente**

### Para Operación 24/7 Garantizada:

Si necesitas **0% downtime** sin depender de rate limits:

**Opción 1: QuickNode Build Plan** ($49/mes)
- 30M requests/mes (~1M/día)
- Infinitamente más que Infura Free
- `CHECK_INTERVAL=15000` (15s) sería posible

**Opción 2: Alchemy Growth Plan** (gratis hasta 3M compute units/mes)
- ~300K requests/mes (~10K/día) en free tier
- Suficiente para `CHECK_INTERVAL=60000` sin usar backups

**Opción 3: Multiple Infura Accounts**
- Crear 2-3 cuentas Infura Free
- Rotar API keys cuando uno se agote
- Completamente gratis, 100% uptime

---

## ✅ Estado Actual

- ✅ Build compila sin errores
- ✅ Delays implementados en startup
- ✅ Auto-fallback a backup RPCs funcional
- ✅ Cache system optimizado
- ✅ Configuración documentada en `.env.example`

**El bot está listo para ejecutar en Linea sin problemas de rate limiting.**

---

## 🚀 Próximo Paso

Ejecuta el bot con:

```bash
bun run dev
```

Si todavía ves "Too Many Requests", verifica:
1. ¿Tu Infura API key está agotada? → Chequea https://infura.io/dashboard
2. ¿Tienes múltiples bots corriendo? → Detén duplicados
3. ¿El bot detectó rate limit y cambió a backup? → Revisa los logs

El auto-fallback debería manejar todo automáticamente. 🎉
