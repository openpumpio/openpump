import type { HttpClient } from '../http.js';

export type PriorityLevel = 'economy' | 'normal' | 'fast' | 'turbo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetStopLossOptions {
  walletId: string;
  mint: string;
  triggerMarketCapSol: number;
  sellPercent?: number;
  slippageBps?: number;
  priorityLevel?: PriorityLevel;
}

export interface StopLossInfo {
  id: string;
  walletId: string;
  mint: string;
  triggerMarketCapSol: number;
  sellPercent: number;
  status: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// StopLoss resource
// ---------------------------------------------------------------------------

export class StopLoss {
  constructor(private readonly _http: HttpClient) {}

  /**
   * Create a stop-loss monitor on a token.
   *
   * @example
   * ```ts
   * const sl = await op.stopLoss.set({
   *   walletId: 'wallet-id',
   *   mint: 'So11...abc',
   *   triggerMarketCapSol: 5.0,
   *   sellPercent: 100,
   * });
   * console.log(sl.id);
   * ```
   */
  async set(options: SetStopLossOptions): Promise<StopLossInfo> {
    return this._http.post<StopLossInfo>('/api/stop-losses', options);
  }

  /**
   * Remove a stop-loss monitor.
   *
   * @example
   * ```ts
   * await op.stopLoss.remove('stop-loss-id');
   * ```
   */
  async remove(stopLossId: string): Promise<void> {
    await this._http.delete<void>(`/api/stop-losses/${stopLossId}`);
  }

  /**
   * Get detailed status of a stop-loss monitor.
   *
   * @example
   * ```ts
   * const sl = await op.stopLoss.getStatus('stop-loss-id');
   * console.log(sl.status, sl.triggerMarketCapSol);
   * ```
   */
  async getStatus(stopLossId: string): Promise<StopLossInfo> {
    return this._http.get<StopLossInfo>(`/api/stop-losses/${stopLossId}`);
  }

  /**
   * List all stop-loss monitors, optionally filtered by status.
   *
   * @example
   * ```ts
   * const monitors = await op.stopLoss.list('active');
   * ```
   */
  async list(status?: string): Promise<StopLossInfo[]> {
    const query: Record<string, string> = {};
    if (status !== undefined) query['status'] = status;
    return this._http.get<StopLossInfo[]>('/api/stop-losses', query);
  }
}
