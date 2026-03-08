import type { HttpClient } from '../http.js';

export interface BundleLaunchOptions {
  devWalletId: string;
  buyWalletIds: string[];
  name: string;
  symbol: string;
  description?: string;
  imageBase64: string;
  imageType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  devBuyAmountLamports?: string;
  walletBuyAmounts: string[];
  tipLamports?: number;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface BundleLaunchResult {
  jobId: string;
}

export class Bundles {
  constructor(private readonly _http: HttpClient) {}

  /**
   * Launch a coordinated token creation + multi-wallet bundle buy.
   * Returns a job ID for polling.
   *
   * @example
   * ```ts
   * const { jobId } = await op.bundles.launch({
   *   devWalletId: 'wallet-1',
   *   buyWalletIds: ['wallet-2', 'wallet-3'],
   *   name: 'My Token',
   *   symbol: 'MTK',
   *   imageBase64: '...',
   *   imageType: 'image/png',
   *   walletBuyAmounts: ['500000000', '500000000'],
   * });
   * const result = await op.jobs.poll(jobId);
   * ```
   */
  async launch(options: BundleLaunchOptions): Promise<BundleLaunchResult> {
    return this._http.post<BundleLaunchResult>('/api/tokens/bundle-launch', options);
  }
}
