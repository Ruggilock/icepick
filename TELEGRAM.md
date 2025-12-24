# Configuración de Notificaciones Telegram

## 🤖 Crear Bot de Telegram

1. Abre Telegram y busca **@BotFather**
2. Envía el comando `/newbot`
3. Sigue las instrucciones para darle un nombre y username a tu bot
4. **Copia el token** que te da (ejemplo: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
5. Pega este token en tu archivo `.env`:
   ```bash
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

## 💬 Obtener tu Chat ID

1. Busca **@userinfobot** en Telegram
2. Envía el comando `/start`
3. El bot te responderá con tu **Chat ID** (ejemplo: `987654321`)
4. Pega este ID en tu archivo `.env`:
   ```bash
   TELEGRAM_CHAT_ID=987654321
   ```

## 📲 Tipos de Notificaciones

### 1. Oportunidad Detectada 🎯
Se envía **cada vez que el bot encuentra una posición liquidable**, sin importar si está dentro de tu capital o no.

**Ejemplo de mensaje:**
```
🎯 ICEPICK - Oportunidad Detectada

Chain: BASE
Protocol: AAVE
Usuario: 0x1234...5678

Health Factor: 0.9543 ⚠️
Debt: $250.00
Collateral: $300.00
Profit estimado: $12.50 💰

Estado: ✅ Dentro de tu capital
Hora: 24/12/2024, 15:30:45
```

**Estados posibles:**
- ✅ **Dentro de tu capital** - El bot intentará liquidar esta posición
- ❌ **Fuera de tu capital disponible** - Solo notificación informativa

### 2. Liquidación Exitosa ✅
Se envía solo si el profit es mayor al threshold configurado (`NOTIFICATION_MIN_PROFIT`).

**Ejemplo de mensaje:**
```
✅ ICEPICK - Liquidación Exitosa!

Chain: BASE
Protocol: AAVE
Profit: $12.50 💰
Gas cost: $0.05
Net: $12.45
TX: 0xabc123...def456
Hora: 24/12/2024, 15:31:12
```

### 3. Liquidación Fallida ❌
Se envía cada vez que una liquidación falla.

**Ejemplo de mensaje:**
```
❌ ICEPICK - Liquidación Fallida

Chain: BASE
Protocol: AAVE
Error: Insufficient USDC balance
Gas lost: $0.03
Hora: 24/12/2024, 15:32:00
```

### 4. Resumen Periódico 📊
Se envía cada N horas (configurable con `SUMMARY_INTERVAL_HOURS`).

**Ejemplo de mensaje:**
```
📊 ICEPICK - Summary Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BASE:
  Liquidations: 5 ✅ / 2 ❌
  Profit: $62.50
  Gas: $0.25
  Net: $62.25

COMBINED:
  Total liquidations: 5 ✅ / 2 ❌
  Success rate: 71.4%
  Total profit: $62.50
  Total gas: $0.25
  Net profit: $62.25 💰
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## ⚙️ Configuración Recomendada

### Configuración Básica (Menos Spam)
```bash
# Bot settings
TELEGRAM_BOT_TOKEN=tu_token_aqui
TELEGRAM_CHAT_ID=tu_chat_id_aqui

# Solo notificar oportunidades dentro de tu capital (RECOMENDADO)
NOTIFY_ONLY_EXECUTABLE=true

# Solo notificar liquidaciones exitosas con profit > $5
NOTIFICATION_MIN_PROFIT=5

# Resumen cada 6 horas
SUMMARY_INTERVAL_HOURS=6
```

### Configuración Avanzada (Ver Todo el Mercado)
```bash
# Bot settings
TELEGRAM_BOT_TOKEN=tu_token_aqui
TELEGRAM_CHAT_ID=tu_chat_id_aqui

# Notificar TODAS las oportunidades (incluso las grandes que no puedes ejecutar)
# ⚠️ ADVERTENCIA: Recibirás MUCHAS notificaciones!
NOTIFY_ONLY_EXECUTABLE=false

# Solo notificar liquidaciones exitosas con profit > $5
NOTIFICATION_MIN_PROFIT=5

# Resumen cada 6 horas
SUMMARY_INTERVAL_HOURS=6
```

### ¿Cuál configuración usar?

**Si tienes $100-200 USDC** → Usa `NOTIFY_ONLY_EXECUTABLE=true`
- Solo recibirás notificaciones de oportunidades que SÍ puedes ejecutar
- Menos spam, más relevante
- Si recibes una notificación, sabes que puedes actuar

**Si quieres estudiar el mercado** → Usa `NOTIFY_ONLY_EXECUTABLE=false`
- Verás TODAS las oportunidades del mercado
- Te ayuda a decidir si agregar más capital
- ⚠️ Puede ser mucho spam (en Base se encuentra una oportunidad grande cada ~6 minutos)

## 🔕 Deshabilitar Notificaciones

Si prefieres no recibir notificaciones, simplemente deja vacíos los campos:

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

El bot seguirá funcionando normalmente, solo no enviará mensajes de Telegram.

## 🧪 Probar Notificaciones

Para verificar que las notificaciones funcionan:

1. Configura tu bot y chat ID
2. Ejecuta el bot: `bun run start`
3. Espera a que encuentre una oportunidad (puede tardar)
4. Deberías recibir un mensaje en Telegram inmediatamente

## ⚠️ Notas Importantes

- **Privacidad**: Nunca compartas tu `TELEGRAM_BOT_TOKEN` o `TELEGRAM_CHAT_ID` con nadie
- **Spam**: Con `NOTIFICATION_MIN_PROFIT=5`, solo recibirás notificaciones de liquidaciones exitosas mayores a $5
- **Volumen**: En mercados volátiles, podrías recibir muchas notificaciones de oportunidades detectadas
- **Latencia**: Las notificaciones se envían en tiempo real, pero pueden tardar 1-2 segundos en llegar
