import type { HttpClient } from '../http.js';

export type PriorityLevel = 'economy' | 'normal' | 'fast' | 'turbo';

export interface QuoteOptions {
  action: 'buy' | 'sell';
  solAmount?: string;
  tokenAmount?: string;
}

export interface QuoteResult {
  route: 'bonding_curve' | 'pumpswap';
  expectedTokens?: string;
  expectedSol?: string;
  priceImpact: number;
  fee: number;
  disclaimer: string;
}

export interface QuoteBuyCostOptions {
  tokenAmount: string;
}

export interface QuoteBuyCostResult {
  solCostLamports: string;
  route: 'bonding_curve' | 'pumpswap';
  disclaimer: string;
}

export interface BuyOptions {
  walletId: string;
  amountLamports: string;
  slippageBps?: number;
  priorityLevel?: PriorityLevel;
}

export interface BuyResult {
  signature: string;
  estimatedTokenAmount: string;
  solSpent: string;
  route: 'bonding_curve' | 'pumpswap';
  disclaimer: string;
}

export interface SellOptions {
  walletId: string;
  tokenAmount: string;
  slippageBps?: number;
  priorityLevel?: PriorityLevel;
}

export interface SellResult {
  signature: string;
  estimatedSolReceived: string;
  tokensSold: string;
  route: 'bonding_curve' | 'pumpswap';
  disclaimer: string;
}

export interface BundleSellEntry {
  walletId: string;
  tokenAmount: string;
}

export interface BundleSellOptions {
  walletSells: BundleSellEntry[];
  tipWalletId?: string;
  tipLamports?: number;
  slippageBps?: number;
  priorityLevel?: PriorityLevel;
}

export interface BundleSellResult {
  bundleResults: Array<{
    bundleId: string;
    status: 'Landed' | 'Failed' | 'Timeout';
    signatures?: string[];
    walletsIncluded: string[];
  }>;
  warnings: Array<{ walletId: string; reason: string }>;
}

export class Trading {
  constructor(private readonly _http: HttpClient) {}

  /**
   * Get a price quote for buying or selling a token.
   *
   * @example
   * ```ts
   * const quote = await op.trading.getQuote('So11...', {
   *   action: 'buy',
   *   solAmount: '1000000000',
   * });
   * console.log(quote.expectedTokens);
   * ```
   */
  async getQuote(mint: string, options: QuoteOptions): Promise<QuoteResult> {
    const query: Record<string, string> = { action: options.action };
    if (options.solAmount !== undefined) query['solAmount'] = options.solAmount;
    if (options.tokenAmount !== undefined) query['tokenAmount'] = options.tokenAmount;
    return this._http.get<QuoteResult>(`/api/tokens/${mint}/quote`, query);
  }

  /** Get the SOL cost to buy a specific number of tokens (inverse quote). */
  async getQuoteBuyCost(
    mint: string,
    options: QuoteBuyCostOptions,
  ): Promise<QuoteBuyCostResult> {
    return this._http.get<QuoteBuyCostResult>(`/api/tokens/${mint}/quote-buy-cost`, {
      tokenAmount: options.tokenAmount,
    });
  }

  /** Execute a buy transaction for a token. */
  async buy(mint: string, options: BuyOptions): Promise<BuyResult> {
    return this._http.post<BuyResult>(`/api/tokens/${mint}/buy`, options);
  }

  /** Execute a sell transaction for a token. */
  async sell(mint: string, options: SellOptions): Promise<SellResult> {
    return this._http.post<SellResult>(`/api/tokens/${mint}/sell`, options);
  }

  /** Multi-wallet sell packed into Jito bundles. */
  async bundleSell(mint: string, options: BundleSellOptions): Promise<BundleSellResult> {
    return this._http.post<BundleSellResult>(`/api/tokens/${mint}/bundle-sell`, options);
  }
}
