import type { HttpClient } from '../http.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VanityPatternType = 'prefix' | 'suffix' | 'contains';
export type VanityAddressType = 'wallet' | 'mint';

export interface VanityEstimateOptions {
  pattern: string;
  patternType?: VanityPatternType;
  caseSensitive?: boolean;
}

export interface VanityEstimateResult {
  credits: number;
  expectedAttempts: number;
  expectedSeconds: number;
}

export interface VanityOrderOptions {
  pattern: string;
  patternType?: VanityPatternType;
  caseSensitive?: boolean;
  addressType?: VanityAddressType;
}

export interface VanityOrderResult {
  jobId: string;
  credits: number;
  expectedSeconds: number;
}

export interface VanityJob {
  id: string;
  pattern: string;
  patternType: string;
  status: string;
  walletId?: string;
  publicKey?: string;
  createdAt: string;
}

export interface VanityJobListOptions {
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Vanity resource
// ---------------------------------------------------------------------------

export class Vanity {
  constructor(private readonly _http: HttpClient) {}

  /**
   * Estimate the credit cost for a vanity Solana address pattern.
   *
   * @example
   * ```ts
   * const estimate = await op.vanity.estimateCost({
   *   pattern: 'PUMP',
   *   patternType: 'prefix',
   * });
   * console.log(`Credits: ${estimate.credits}`);
   * ```
   */
  async estimateCost(options: VanityEstimateOptions): Promise<VanityEstimateResult> {
    const query: Record<string, string> = { pattern: options.pattern };
    if (options.patternType !== undefined) query['patternType'] = options.patternType;
    if (options.caseSensitive !== undefined) {
      query['caseSensitive'] = String(options.caseSensitive);
    }
    return this._http.get<VanityEstimateResult>('/api/vanity/estimate', query);
  }

  /**
   * Order a vanity Solana wallet address. Credits are deducted immediately.
   * The address is mined asynchronously — use `getJob()` to poll for completion.
   *
   * @example
   * ```ts
   * const { jobId } = await op.vanity.order({
   *   pattern: 'PUMP',
   *   patternType: 'prefix',
   *   addressType: 'wallet',
   * });
   * const job = await op.vanity.getJob(jobId);
   * ```
   */
  async order(options: VanityOrderOptions): Promise<VanityOrderResult> {
    return this._http.post<VanityOrderResult>('/api/vanity/order', options);
  }

  /**
   * Get the status of a vanity address mining job.
   *
   * @example
   * ```ts
   * const job = await op.vanity.getJob('job-id');
   * if (job.status === 'completed') {
   *   console.log(job.publicKey);
   * }
   * ```
   */
  async getJob(jobId: string): Promise<VanityJob> {
    return this._http.get<VanityJob>(`/api/vanity/jobs/${jobId}`);
  }

  /**
   * List vanity address mining jobs (newest first).
   *
   * @example
   * ```ts
   * const jobs = await op.vanity.listJobs({ limit: 10 });
   * ```
   */
  async listJobs(options?: VanityJobListOptions): Promise<VanityJob[]> {
    const query: Record<string, string> = {};
    if (options?.limit !== undefined) query['limit'] = String(options.limit);
    if (options?.offset !== undefined) query['offset'] = String(options.offset);
    return this._http.get<VanityJob[]>('/api/vanity/jobs', query);
  }
}
