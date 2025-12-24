# 📋 Guía de Logs del Bot

## 🎯 Logs que Verás Ahora

He agregado logs detallados en cada paso del proceso de liquidación para que puedas debuggear exactamente qué está pasando.

### 1. Cuando Encuentra una Oportunidad

```
[HH:MM:SS] warn  Found liquidatable position!
  {"user":"0x...","healthFactor":"0.9910","debtUSD":"28.91"}
[HH:MM:SS] info  ✅ Profitable opportunity
  {"netProfit":"14.92","debtToCover":"14.46","bonus":"107.5%"}
```

**Qué significa:**
- Health Factor < 1.0 = La posición es liquidable
- debtUSD = Deuda total del usuario
- debtToCover = Cuánto USDC necesitas para liquidar (50% de la deuda)
- netProfit = Profit estimado después de costos
- bonus = Bonus de liquidación (normalmente 5-10%, aquí 107.5% es MUY alto!)

---

### 2. Simulación de Liquidación

```
[HH:MM:SS] info  🔬 Simulating transaction...
[HH:MM:SS] info  🔬 Simulating liquidation...
  {
    "user":"0x...",
    "collateralAsset":"0x...",
    "debtAsset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "debtToCover":"14460000",
    "expectedProfit":"14.92"
  }
```

**Qué significa:**
- Está simulando la liquidación SIN gastar gas
- collateralAsset = Token que recibirás (WETH, cbETH, etc.)
- debtAsset = Token que necesitas pagar (USDC)
- debtToCover = Cantidad en wei (14460000 = $14.46 USDC con 6 decimals)

**Si la simulación falla, verás:**
```
[HH:MM:SS] warn  ⚠️  Simulation failed
  {
    "message":"...",
    "code":"...",
    "reason":"...",
    "shortMessage":"..."
  }
```

---

### 3. Ejecución de Liquidación (Si Simulación Pasa)

#### Paso 1: Verificar Balance
```
[HH:MM:SS] info  Checking wallet balance...
[HH:MM:SS] info  Debt token balance check:
  {
    "token":"USDC",
    "required":"14460000",
    "available":"100000000",
    "sufficient":true
  }
```

**Qué buscar:**
- `sufficient: true` = Tienes suficiente USDC ✅
- `sufficient: false` = NO tienes suficiente USDC ❌

#### Paso 2: Verificar/Dar Approval
```
[HH:MM:SS] info  Checking allowance...
[HH:MM:SS] info  Current allowance:
  {
    "allowance":"0",
    "required":"14460000",
    "needsApproval":true
  }
```

**Si necesita approval:**
```
[HH:MM:SS] info  ⏳ Approving debt token...
  {"spender":"0xA238Dd80C259a72e81d7e4664a9801593F98d1c5","amount":"14460000"}
[HH:MM:SS] info  Approval tx sent, waiting for confirmation...
  {"txHash":"0x..."}
[HH:MM:SS] info  ✅ Approval confirmed
```

**Si ya estaba aprovado:**
```
[HH:MM:SS] info  ✅ Already approved, skipping approval
```

#### Paso 3: Ejecutar Liquidación
```
[HH:MM:SS] info  ⚡ Executing liquidation call...
  {
    "poolAddress":"0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    "collateralAsset":"0x4200000000000000000000000000000000000006",
    "debtAsset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "user":"0x4d6c606EB50AdAE9912132d449Bba4B2564D07a0",
    "debtToCover":"14460000"
  }
```

```
[HH:MM:SS] info  ⏳ Liquidation tx sent, waiting for confirmation...
  {"txHash":"0x...","blockNumber":12345}
```

**Si tiene éxito:**
```
[HH:MM:SS] info  ✅ Liquidation successful!
  {
    "txHash":"0x...",
    "blockNumber":12345,
    "gasUsed":"234567"
  }
```

**Si falla:**
```
[HH:MM:SS] error  ❌ Transaction reverted!
  {"txHash":"0x...","status":0}
```

#### Paso 4: Collateral Recibido
```
[HH:MM:SS] info  💰 Collateral received:
  {
    "amount":"15500000000000000",
    "symbol":"WETH",
    "before":"0",
    "after":"15500000000000000"
  }
```

**Qué significa:**
- amount = Cuánto collateral recibiste en wei
- Si es WETH (18 decimals): 15500000000000000 = 0.0155 WETH
- Si es cbETH, DAI, etc., similar

---

## ❌ Errores Comunes y Qué Significan

### 1. "Insufficient USDC balance"
```
[HH:MM:SS] error  ❌ Insufficient debt token balance
  {
    "required":"14460000",
    "available":"0",
    "deficit":"14460000"
  }
```

**Causa:** No tienes USDC en tu wallet
**Solución:** Transfiere USDC a la wallet del bot

---

### 2. "Simulation failed" con "call revert exception"
```
[HH:MM:SS] warn  ⚠️  Simulation failed
  {
    "message":"call revert exception",
    "code":"CALL_EXCEPTION",
    "reason":"..."
  }
```

**Posibles causas:**
1. **Ya fue liquidado** - Alguien más lo liquidó primero
2. **Health factor recuperó** - El precio cambió y ya no es liquidable
3. **Insufficient allowance** - Aunque esto debería detectarse antes
4. **Contrato pausado** - AAVE pausó liquidaciones (muy raro)

---

### 3. "Transaction failed" después de enviar
```
[HH:MM:SS] error  ❌ Transaction reverted!
  {"txHash":"0x...","status":0}
```

**Causas:**
1. Gas insuficiente (muy raro en Base)
2. Precio cambió mientras se minaba el tx
3. Alguien más liquidó en el mismo bloque

---

### 4. "JSON.stringify cannot serialize BigInt"
**Este error ya lo arreglamos.** Si lo vuelves a ver, avísame.

---

## 🔍 Cómo Debuggear con los Logs

### Escenario 1: Simulación Falla
1. Busca el log `🔬 Simulating liquidation...`
2. Copia los parámetros (user, collateralAsset, debtAsset, etc.)
3. Ve a [Basescan](https://basescan.org/) y busca el usuario
4. Verifica si todavía tiene deuda y si el health factor es < 1.0
5. Si ya no es liquidable, alguien más lo liquidó o el precio cambió

### Escenario 2: Insufficient Balance
1. Busca `Debt token balance check`
2. Si `available: 0`, necesitas USDC en tu wallet
3. Transfiere USDC a: `tu_wallet_address`

### Escenario 3: Approval Falla
1. Busca `Approving debt token...`
2. Si la tx falla, puede ser:
   - Gas insuficiente (necesitas ETH para gas)
   - RPC down

### Escenario 4: Liquidation Call Falla
1. Busca `⚡ Executing liquidation call...`
2. Copia el txHash del log
3. Ve a Basescan y revisa la tx
4. Mira los eventos para ver qué pasó

---

## 📊 Logs de Debugging Adicionales

Si quieres aún MÁS información, cambia el `LOG_LEVEL` en tu `.env`:

```bash
# En .env
LOG_LEVEL=debug  # En vez de 'info'
```

Esto mostrará logs adicionales como:
- Parámetros exactos de cada llamada a smart contract
- Responses de RPC
- Detalles de cálculos internos

---

## 🎯 Próximos Pasos

Ahora cuando el bot encuentre la oportunidad de nuevo, verás **EXACTAMENTE** en qué paso falla:

1. ✅ Encuentra oportunidad
2. ✅ Calcula profit
3. 🔬 **Simula** → Aquí verás el error real
4. (Solo si simulación pasa) Verifica balance
5. (Solo si simulación pasa) Da approval
6. (Solo si simulación pasa) Ejecuta liquidación

Reinicia el bot y comparte los logs cuando encuentre la próxima oportunidad.
