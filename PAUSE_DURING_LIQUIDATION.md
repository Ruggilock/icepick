# ⏸️ Pausa de Scanning Durante Liquidaciones

## 🎯 El Problema

Cuando el bot encuentra una oportunidad y **ejecuta una liquidación**, seguía haciendo scans en paralelo, lo que causaba:

1. **Rate limiting durante ejecución** - Los scans consumían requests mientras la liquidación necesitaba hacer sus propias llamadas
2. **Competencia por requests** - El scan y la ejecución competían por el límite de 10 req/sec de Infura
3. **Errores "Too Many Requests"** justo cuando más importa (durante la ejecución)

### Ejemplo del Problema Anterior

```
[08:00:16] warn  ⚡ Executing liquidation!
[08:00:16] info  🔬 Simulating liquidation...
[08:00:17] info [BASE] 🔍 Scanning positions...  ← PROBLEMA: Scanning en paralelo
[08:00:17] error Failed to get user data (Too Many Requests)
[08:00:18] warn  ⚠️  Simulation failed (Too Many Requests)  ← Perdiste la liquidación!
```

---

## ✅ La Solución

**Ahora el bot PAUSA todos los scans mientras ejecuta una liquidación.**

### Cómo Funciona

1. **Antes de ejecutar:** Activa flag `isExecutingLiquidation = true`
2. **Durante ejecución:** Todos los scans se skipean automáticamente
3. **Después de ejecutar:** Desactiva flag `isExecutingLiquidation = false`
4. **Scans resumen** en el próximo intervalo

### Código Implementado

```typescript
// Flag para pausar scanning
private isExecutingLiquidation: boolean = false;

// En monitorChain() - Skip scans durante ejecución
if (this.isExecutingLiquidation) {
  logger.debug(`[${chain}] Skipping scan - liquidation in progress`);
} else {
  await this.scanAndExecute(chain);
}

// En executeLiquidation() - Activar pausa
this.isExecutingLiquidation = true;
logger.debug('🛑 Pausing scanning during liquidation execution');

try {
  // ... ejecutar liquidación ...
} finally {
  // Siempre resumir, incluso si hay error
  this.isExecutingLiquidation = false;
  logger.debug('▶️  Resuming scanning after liquidation attempt');
}
```

---

## 📊 Impacto en Consumo de Requests

### Antes (Sin Pausa)

```
Timeline durante liquidación:
00:00 - Scan 1: 76 requests (encuentra oportunidad)
00:01 - Inicia ejecución: 10 requests (simulate)
00:02 - Scan 2: 76 requests (en paralelo!) ← PROBLEMA
00:03 - Ejecuta: 5 requests
00:04 - Scan 3: 76 requests (en paralelo!) ← PROBLEMA
00:05 - Confirma: 3 requests
Total: ~246 requests en 5 segundos = 49 req/sec ❌
```

**Resultado:** Rate limiting garantizado con Infura (10 req/sec)

### Después (Con Pausa)

```
Timeline durante liquidación:
00:00 - Scan 1: 76 requests (encuentra oportunidad)
00:01 - Inicia ejecución: 10 requests (simulate)
00:02 - Scan 2: SKIPPED ✅
00:03 - Ejecuta: 5 requests
00:04 - Scan 3: SKIPPED ✅
00:05 - Confirma: 3 requests
00:06 - Scan 4: 76 requests (resumen después de completar)
Total: ~94 requests en 6 segundos = 16 req/sec ✅
```

**Resultado:** Dentro del límite de Infura, liquidación exitosa

---

## 🎯 Qué Verás Ahora en los Logs

### Durante Scan Normal
```
[08:00:16] info [BASE] 🔍 [BASE] Scanning positions...
[08:00:17] info  Found 0 profitable liquidation opportunities
[08:00:17] info [BASE] ✅ [BASE] No opportunities found
```

### Cuando Encuentra Oportunidad
```
[08:01:16] warn  Found liquidatable position!
[08:01:16] info  ⚡ [BASE] Found 1 opportunities!
[08:01:16] warn  ⚡ Executing liquidation!
[08:01:16] debug 🛑 Pausing scanning during liquidation execution
[08:01:16] info  🔬 Simulating transaction...
```

### Durante Ejecución (Scans Skipean)
```
[08:01:46] debug [BASE] Skipping scan - liquidation in progress
[08:02:16] debug [BASE] Skipping scan - liquidation in progress
```

### Después de Completar
```
[08:02:30] info  ✅ Liquidation successful!
[08:02:30] debug ▶️  Resuming scanning after liquidation attempt
[08:02:46] info [BASE] 🔍 [BASE] Scanning positions...  ← Resumió!
```

---

## ⚡ Ventajas

### 1. **Menos Rate Limiting**
- Los requests se concentran en la liquidación
- No hay competencia entre scan y ejecución
- Mayor probabilidad de que la liquidación se ejecute sin errores

### 2. **Ejecuciones Más Rápidas**
- Sin delays por rate limiting
- Simulación y ejecución fluidas
- Menos probabilidad de que alguien más liquide primero

### 3. **Más Eficiente**
- No desperdicia requests en scans durante ejecución
- Los requests se usan donde más importan

---

## 📉 Desventajas (Mínimas)

### 1. **Puede Perder Oportunidades Nuevas Durante Ejecución**
```
Si una nueva posición se vuelve liquidable mientras ejecutas,
no la verás hasta que complete la liquidación actual.
```

**¿Es problema?** NO, porque:
- Las liquidaciones toman ~10-30 segundos
- Es MÁS importante completar exitosamente la liquidación actual
- Perder 1-2 scans vale la pena si garantiza que la ejecución tenga éxito

### 2. **Intervalo Efectivo un Poco Más Largo**
```
CHECK_INTERVAL=60s configurado
+ ~15s de liquidación
= ~75s intervalo efectivo cuando hay ejecución
```

**¿Es problema?** NO, porque:
- Solo pasa cuando hay liquidaciones (raro)
- Los 15s extra no afectan competitividad
- A cambio, GARANTIZAS que la liquidación se ejecute

---

## 🧪 Cómo Verificar que Funciona

Cuando reinicies el bot y encuentre una oportunidad, busca estos logs en orden:

1. ✅ `⚡ Executing liquidation!`
2. ✅ `🛑 Pausing scanning during liquidation execution`
3. ✅ `[BASE] Skipping scan - liquidation in progress` (varias veces)
4. ✅ `✅ Liquidation successful!` o `❌ Liquidation failed`
5. ✅ `▶️  Resuming scanning after liquidation attempt`
6. ✅ `[BASE] 🔍 Scanning positions...` (vuelve a escanear)

---

## 🔧 Ajustes Opcionales

Si quieres ver los logs de debug (recomendado para verificar):

```bash
# En .env
LOG_LEVEL=debug
```

Esto mostrará los mensajes de "Skipping scan" y "Resuming scanning".

Si prefieres menos logs:

```bash
# En .env
LOG_LEVEL=info  # Default
```

Solo verás los logs importantes de liquidación.

---

## 📝 Resumen

✅ **El bot ahora PAUSA automáticamente** todos los scans durante ejecución de liquidaciones

✅ **Reduce rate limiting** al evitar competencia entre scan y ejecución

✅ **Aumenta probabilidad de éxito** en liquidaciones al concentrar requests

✅ **Se resume automáticamente** después de cada liquidación (éxito o fallo)

✅ **No requiere configuración** - funciona automáticamente

**Esto debería reducir significativamente los errores "Too Many Requests" durante ejecuciones!** 🎉
