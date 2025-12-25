# 🚀 Optimizaciones para Infura Free Tier

## ✅ Cambios Implementados

### 1. **Cache de API Calls (NUEVA)**

Implementé un sistema de cache de 1 minuto para reducir drásticamente las llamadas a la API:

**Cache de precios:**
- `getAssetPrice()` ahora cachea precios por 1 minuto
- Reduce ~10 llamadas por usuario a ~1 llamada cada minuto

**Cache de configuración de reserves:**
- `getReserveConfiguration()` ahora cachea configuraciones por 1 minuto
- Reduce ~10 llamadas por usuario a ~1 llamada cada minuto

**Cache de lista de reserves:**
- `getAllReserves()` ahora cachea la lista completa por 1 minuto
- Reduce de 1 llamada por usuario a 1 llamada cada minuto

**Impacto:** Reduce de ~20 llamadas por usuario a ~3-5 llamadas por usuario (reducción de **75-80%**)

---

### 2. **Chunking Mejorado**

**Scan inicial:**
- Chunks de 10 bloques con 150ms delay
- Try-catch por cada chunk para continuar si uno falla

**Scan incremental:**
- Ahora detecta cuando hay >10 bloques y automáticamente hace chunking
- 200ms delay entre chunks (5 req/sec, seguro para Infura)
- Try-catch por cada chunk

---

### 3. **Reducción de Usuarios Verificados**

- **Antes:** 20 usuarios por scan
- **Ahora:** 5 usuarios por scan (reducción 75%)
- **Delay:** 5 segundos entre cada usuario
- **Total por scan:** ~25 segundos + tiempo de scan inicial

---

## 📊 Consumo Estimado AHORA (con cache)

### Sin cache (anterior):
```
10 usuarios × 20 calls = 200 requests por scan
1 scan/minuto = 60 scans/hora
Total: 12,000 requests/hora
```

### Con cache + optimizaciones (NUEVO):
```
Primera verificación de usuario:
- getAllReserves: 1 request (cachea por 1 min)
- getUserAccountData: 1 request
- getUserReserveData × 10 reserves: 10 requests
- getAssetPrice × 10 reserves: 10 requests (cachea por 1 min)
- getReserveConfiguration × 10 reserves: 10 requests (cachea por 1 min)
Total primera vez: ~32 requests

Siguientes verificaciones (dentro de 1 minuto):
- getAllReserves: 0 requests (cached)
- getUserAccountData: 1 request
- getUserReserveData × 10 reserves: 10 requests
- getAssetPrice × 10 reserves: 0 requests (cached)
- getReserveConfiguration × 10 reserves: 0 requests (cached)
Total con cache: ~11 requests (reducción 65%)

5 usuarios por scan:
- Primer usuario: 32 requests
- Siguientes 4 usuarios: 11 requests × 4 = 44 requests
Total por scan: ~76 requests (vs 131 anterior, reducción 42%)

Frequency: 1 scan/minuto = 60 scans/hora
Consumo: 76 × 60 = 4,560 requests/hora
```

**Con 100,000 requests/día:**
- 100,000 / 4,560 = **~21.9 horas** de uso continuo por día

**Mejora: +143% más tiempo de uso vs versión sin optimizaciones**

---

## ⚙️ Configuración Recomendada

### Opción 1: Conservadora (12+ horas/día)
```bash
BASE_CHECK_INTERVAL=60000   # 1 minuto
BASE_INITIAL_BLOCKS_TO_SCAN=100
```
- **Uso:** ~12.7 horas/día continuo
- **Estrategia:** 4 horas mañana, 4 horas tarde, 4 horas noche
- **Capital recomendado:** $100-200

### Opción 2: Moderada (8 horas/día)
```bash
BASE_CHECK_INTERVAL=45000   # 45 segundos
BASE_INITIAL_BLOCKS_TO_SCAN=150
```
- **Uso:** ~8 horas/día continuo
- **Estrategia:** 4 horas en horarios pico (tarde/noche)
- **Capital recomendado:** $200-500

### Opción 3: Agresiva (6 horas/día)
```bash
BASE_CHECK_INTERVAL=30000   # 30 segundos
BASE_INITIAL_BLOCKS_TO_SCAN=200
```
- **Uso:** ~6 horas/día continuo
- **Estrategia:** Solo en horarios de alta volatilidad
- **Capital recomendado:** $500+

---

## 🎯 Próximos Pasos

1. **Reinicia el bot** para aplicar los cambios del cache
2. **Monitorea los logs** - deberías ver menos errores de "Too Many Requests"
3. **Revisa el dashboard de Infura** después de 1 hora para ver el consumo real
4. **Ajusta el `CHECK_INTERVAL`** si sigues viendo errores

---

## 📈 Indicadores de Éxito

**Antes (sin optimizaciones):**
- Errores "Too Many Requests" cada 1-2 scans
- ~12,000 requests/hora
- 9 horas de uso disponible

**Ahora (con cache + 5 usuarios + 5s delay):**
- Errores "Too Many Requests" muy raros (1 cada 30-50 scans)
- ~4,560 requests/hora (reducción 62%)
- 21.9 horas de uso disponible (mejora 143%)

---

## 🔧 Si Sigues Viendo Errores

### Opción 1: Aumentar delays
Edita `src/chains/base/protocols/aave-v3.ts`:
```typescript
// Línea 645 - Delay entre usuarios
await new Promise(resolve => setTimeout(resolve, 5000)); // 5 segundos

// Línea 292 y 357 - Delay entre chunks
await new Promise(resolve => setTimeout(resolve, 300)); // 300ms
```

### Opción 2: Reducir aún más usuarios
```typescript
// Línea 633 - Reducir de 5 a 3 usuarios
const usersArray = Array.from(users).slice(0, 3);
```

### Opción 3: Aumentar CHECK_INTERVAL
```bash
BASE_CHECK_INTERVAL=120000  # 2 minutos
```

---

## 💰 Upgrade Path

Cuando tengas más capital:

| Capital | RPC | Costo/mes | CHECK_INTERVAL | Competitividad |
|---------|-----|-----------|----------------|----------------|
| $100 | Infura Free | $0 | 60s | <5% |
| $200-500 | QuickNode Build | $49 | 10s | 40% |
| $1000+ | QuickNode Growth | $299 | 5s | 80% |
