import { logger } from './logger.ts';
import type { LiquidationResult, ChainMetrics } from '../types/index.ts';

export class TelegramNotifier {
  private botToken?: string;
  private chatId?: string;
  private minProfitForNotification: number;

  constructor(botToken?: string, chatId?: string, minProfit: number = 5) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.minProfitForNotification = minProfit;
  }

  private async sendMessage(message: string): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });

      return response.ok;
    } catch (error) {
      logger.error('Failed to send Telegram notification', { error });
      return false;
    }
  }

  async notifySuccess(result: LiquidationResult): Promise<void> {
    if (!result.profit || result.profit < this.minProfitForNotification) {
      return;
    }

    const message = `
✅ <b>ICEPICK - Liquidación Exitosa!</b>

<b>Chain:</b> ${result.chain.toUpperCase()}
<b>Protocol:</b> ${result.protocol.toUpperCase()}
<b>Profit:</b> $${result.profit.toFixed(2)} 💰
<b>Gas cost:</b> $${result.gasCostUSD?.toFixed(2) || '0'}
<b>Net:</b> $${(result.profit - (result.gasCostUSD || 0)).toFixed(2)}
<b>TX:</b> <code>${result.txHash}</code>
<b>Hora:</b> ${result.timestamp.toLocaleString()}
    `.trim();

    await this.sendMessage(message);
  }

  async notifyFailure(result: LiquidationResult): Promise<void> {
    const message = `
❌ <b>ICEPICK - Liquidación Fallida</b>

<b>Chain:</b> ${result.chain.toUpperCase()}
<b>Protocol:</b> ${result.protocol.toUpperCase()}
<b>Error:</b> ${result.error}
<b>Gas lost:</b> $${result.gasCostUSD?.toFixed(2) || '0'}
<b>Hora:</b> ${result.timestamp.toLocaleString()}
    `.trim();

    await this.sendMessage(message);
  }

  async notifyOpportunity(
    chain: string,
    protocol: string,
    userAddress: string,
    healthFactor: number,
    debtUSD: number,
    collateralUSD: number,
    estimatedProfitUSD: number,
    withinCapital: boolean
  ): Promise<void> {
    const icon = withinCapital ? '🎯' : '⚠️';
    const capitalStatus = withinCapital
      ? '✅ Dentro de tu capital'
      : '❌ Fuera de tu capital disponible';

    const message = `
${icon} <b>ICEPICK - Oportunidad Detectada</b>

<b>Chain:</b> ${chain.toUpperCase()}
<b>Protocol:</b> ${protocol.toUpperCase()}
<b>Usuario:</b> <code>${userAddress}</code>

<b>Health Factor:</b> ${healthFactor.toFixed(4)} ⚠️
<b>Debt:</b> $${debtUSD.toFixed(2)}
<b>Collateral:</b> $${collateralUSD.toFixed(2)}
<b>Profit estimado:</b> $${estimatedProfitUSD.toFixed(2)} 💰

<b>Estado:</b> ${capitalStatus}
<b>Hora:</b> ${new Date().toLocaleString()}
    `.trim();

    await this.sendMessage(message);
  }

  async sendSummary(baseMetrics?: ChainMetrics, arbitrumMetrics?: ChainMetrics): Promise<void> {
    const totalSuccessful = (baseMetrics?.successfulLiquidations || 0) + (arbitrumMetrics?.successfulLiquidations || 0);
    const totalFailed = (baseMetrics?.failedLiquidations || 0) + (arbitrumMetrics?.failedLiquidations || 0);
    const totalProfit = (baseMetrics?.totalProfitUSD || 0) + (arbitrumMetrics?.totalProfitUSD || 0);
    const totalGas = (baseMetrics?.totalGasSpentUSD || 0) + (arbitrumMetrics?.totalGasSpentUSD || 0);
    const netProfit = totalProfit - totalGas;

    const successRate = totalSuccessful + totalFailed > 0
      ? ((totalSuccessful / (totalSuccessful + totalFailed)) * 100).toFixed(1)
      : '0';

    let message = `
📊 <b>ICEPICK - Summary Report</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();

    if (baseMetrics) {
      message += `

<b>BASE:</b>
  Liquidations: ${baseMetrics.successfulLiquidations} ✅ / ${baseMetrics.failedLiquidations} ❌
  Profit: $${baseMetrics.totalProfitUSD.toFixed(2)}
  Gas: $${baseMetrics.totalGasSpentUSD.toFixed(2)}
  Net: $${(baseMetrics.totalProfitUSD - baseMetrics.totalGasSpentUSD).toFixed(2)}
`;
    }

    if (arbitrumMetrics) {
      message += `

<b>ARBITRUM:</b>
  Liquidations: ${arbitrumMetrics.successfulLiquidations} ✅ / ${arbitrumMetrics.failedLiquidations} ❌
  Profit: $${arbitrumMetrics.totalProfitUSD.toFixed(2)}
  Gas: $${arbitrumMetrics.totalGasSpentUSD.toFixed(2)}
  Net: $${(arbitrumMetrics.totalProfitUSD - arbitrumMetrics.totalGasSpentUSD).toFixed(2)}
`;
    }

    message += `

<b>COMBINED:</b>
  Total liquidations: ${totalSuccessful} ✅ / ${totalFailed} ❌
  Success rate: ${successRate}%
  Total profit: $${totalProfit.toFixed(2)}
  Total gas: $${totalGas.toFixed(2)}
  Net profit: $${netProfit.toFixed(2)} 💰
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();

    await this.sendMessage(message);
  }

  async notifyCriticalError(chain: string, errorType: string, errorMessage: string): Promise<void> {
    const message = `
🚨 <b>ICEPICK - Error Crítico</b>

<b>Chain:</b> ${chain.toUpperCase()}
<b>Tipo:</b> ${errorType}
<b>Error:</b> ${errorMessage}
<b>Hora:</b> ${new Date().toLocaleString()}

⚠️ El bot puede requerir atención inmediata
    `.trim();

    await this.sendMessage(message);
  }

  async notifyBotPaused(chain: string, consecutiveFailures: number, pauseDuration: number): Promise<void> {
    const message = `
⏸️ <b>ICEPICK - Bot Pausado</b>

<b>Chain:</b> ${chain.toUpperCase()}
<b>Fallos consecutivos:</b> ${consecutiveFailures}
<b>Duración pausa:</b> ${pauseDuration}s

El bot se pausó automáticamente por múltiples fallos. Se reanudará en ${pauseDuration}s.

<b>Hora:</b> ${new Date().toLocaleString()}
    `.trim();

    await this.sendMessage(message);
  }

  async notifyBotResumed(chain: string): Promise<void> {
    const message = `
▶️ <b>ICEPICK - Bot Reanudado</b>

<b>Chain:</b> ${chain.toUpperCase()}

El bot se reanudó después de la pausa automática.

<b>Hora:</b> ${new Date().toLocaleString()}
    `.trim();

    await this.sendMessage(message);
  }
}
