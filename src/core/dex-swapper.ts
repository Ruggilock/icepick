import { Contract, Wallet } from 'ethers';
import { STANDARD_ROUTER_ABI, ERC20_ABI } from '../config/abis/index.ts';
import { logger } from '../utils/logger.ts';
import type { ChainName } from '../types/index.ts';

export class DEXSwapper {
  private wallet: Wallet;
  private chain: ChainName;
  private routers: Map<string, Contract>;
  private maxSlippage: number;

  constructor(
    wallet: Wallet,
    chain: ChainName,
    routerAddresses: string[],
    maxSlippage: number = 2
  ) {
    this.wallet = wallet;
    this.chain = chain;
    this.maxSlippage = maxSlippage;
    this.routers = new Map();

    // Initialize router contracts
    for (const address of routerAddresses) {
      this.routers.set(address, new Contract(address, STANDARD_ROUTER_ABI, wallet));
    }
  }

  /**
   * Get best quote across all DEXs
   */
  async getBestQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint
  ): Promise<{ router: string; amountOut: bigint } | null> {
    let bestQuote: { router: string; amountOut: bigint } | null = null;

    for (const [routerAddress, router] of this.routers) {
      try {
        if (!router.getAmountsOut) continue;

        const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
        const amountOut = amounts[1] as bigint;

        if (!bestQuote || amountOut > bestQuote.amountOut) {
          bestQuote = { router: routerAddress, amountOut };
        }
      } catch (error) {
        logger.debug(`Failed to get quote from ${routerAddress}`, { error });
      }
    }

    return bestQuote;
  }

  /**
   * Execute swap with slippage protection
   */
  async swap(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    minAmountOut?: bigint
  ): Promise<bigint> {
    // Get best quote
    const quote = await this.getBestQuote(tokenIn, tokenOut, amountIn);
    if (!quote) {
      throw new Error('No valid quotes found');
    }

    // Calculate min amount out with slippage
    const slippageFactor = 1 - (this.maxSlippage / 100);
    const calculatedMinOut = (quote.amountOut * BigInt(Math.floor(slippageFactor * 10000))) / 10000n;
    const finalMinOut = minAmountOut && minAmountOut > calculatedMinOut ? minAmountOut : calculatedMinOut;

    logger.info(`Swapping on ${this.chain}`, {
      tokenIn,
      tokenOut,
      amountIn: amountIn.toString(),
      expectedOut: quote.amountOut.toString(),
      minOut: finalMinOut.toString(),
    });

    // Approve if needed
    await this.approveIfNeeded(tokenIn, quote.router, amountIn);

    // Execute swap
    const router = this.routers.get(quote.router);
    if (!router) {
      throw new Error('Router not found');
    }

    if (!router.swapExactTokensForTokens) {
      throw new Error('Router does not support swapExactTokensForTokens');
    }

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes

    const tx = await router.swapExactTokensForTokens(
      amountIn,
      finalMinOut,
      [tokenIn, tokenOut],
      this.wallet.address,
      deadline
    );

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error('Transaction receipt is null');
    }

    logger.info('Swap completed', {
      txHash: receipt.hash,
    });

    // Get final balance to calculate actual amount received
    const tokenOutContract = new Contract(tokenOut, ERC20_ABI, this.wallet);
    if (!tokenOutContract.balanceOf) {
      throw new Error('Token contract does not support balanceOf');
    }

    const balance = await tokenOutContract.balanceOf(this.wallet.address);

    return balance;
  }

  /**
   * Approve token spending if needed
   */
  private async approveIfNeeded(
    token: string,
    spender: string,
    amount: bigint
  ): Promise<void> {
    const tokenContract = new Contract(token, ERC20_ABI, this.wallet);

    if (!tokenContract.allowance || !tokenContract.approve) {
      throw new Error('Token contract does not support allowance or approve');
    }

    const currentAllowance = await tokenContract.allowance(this.wallet.address, spender);

    if (currentAllowance < amount) {
      logger.info('Approving token', { token, spender });
      const tx = await tokenContract.approve(spender, amount);
      await tx.wait();
    }
  }
}
