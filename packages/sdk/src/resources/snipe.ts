import type { HttpClient } from '../http.js';

export type PriorityLevel = 'economy' | 'normal' | 'fast' | 'turbo';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonitorCriteria {
  tickerPattern: string;
  buyAmountSol: number;
  maxBuys?: number;
  maxMarketCapSol?: number;
  minMarketCapSol?: number;
  maxDevPercent?: number;
  maxTop10Percent?: number;
  maxSniperCount?: number;
  maxAgeSeconds?: number;
  requireSocial?: boolean;
  slippageBps?: number;
  priorityLevel?: PriorityLevel;
}

export interface StartMonitorOptions extends MonitorCriteria {
  walletId: string;
}

export interface MonitorInfo {
  id: string;
  walletId: string;
  status: string;
  criteria: MonitorCriteria;
  buyCount: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Snipe resource
// ---------------------------------------------------------------------------

export class Snipe {
  constructor(private readonly _http: HttpClient) {}

  /**
   * Create and start a snipe monitor that auto-buys new tokens matching criteria.
   *
   * @example
   * ```ts
   * const monitor = await op.snipe.startMonitor({
   *   walletId: 'wallet-id',
   *   tickerPattern: 'PEPE*',
   *   buyAmountSol: 0.05,
   *   maxBuys: 3,
   * });
   * console.log(monitor.id);
   * ```
   */
  async startMonitor(options: StartMonitorOptions): Promise<MonitorInfo> {
    return this._http.post<MonitorInfo>('/api/snipe-monitors/monitors', options);
  }

  /**
   * Stop a snipe monitor permanently.
   *
   * @example
   * ```ts
   * await op.snipe.stopMonitor('monitor-id');
   * ```
   */
  async stopMonitor(monitorId: string): Promise<void> {
    await this._http.post<void>(`/api/snipe-monitors/monitors/${monitorId}/stop`);
  }

  /**
   * Pause a snipe monitor temporarily.
   *
   * @example
   * ```ts
   * await op.snipe.pauseMonitor('monitor-id');
   * ```
   */
  async pauseMonitor(monitorId: string): Promise<void> {
    await this._http.post<void>(`/api/snipe-monitors/monitors/${monitorId}/pause`);
  }

  /**
   * Resume a paused snipe monitor.
   *
   * @example
   * ```ts
   * await op.snipe.resumeMonitor('monitor-id');
   * ```
   */
  async resumeMonitor(monitorId: string): Promise<void> {
    await this._http.post<void>(`/api/snipe-monitors/monitors/${monitorId}/resume`);
  }

  /**
   * Update criteria on an active or paused snipe monitor.
   *
   * @example
   * ```ts
   * await op.snipe.updateMonitor('monitor-id', {
   *   buyAmountSol: 0.1,
   *   maxBuys: 5,
   * });
   * ```
   */
  async updateMonitor(
    monitorId: string,
    options: Partial<MonitorCriteria>,
  ): Promise<MonitorInfo> {
    return this._http.patch<MonitorInfo>(
      `/api/snipe-monitors/monitors/${monitorId}`,
      options,
    );
  }

  /**
   * Get detailed status of a snipe monitor.
   *
   * @example
   * ```ts
   * const monitor = await op.snipe.getMonitorStatus('monitor-id');
   * console.log(monitor.status, monitor.buyCount);
   * ```
   */
  async getMonitorStatus(monitorId: string): Promise<MonitorInfo> {
    return this._http.get<MonitorInfo>(`/api/snipe-monitors/monitors/${monitorId}`);
  }

  /**
   * List all snipe monitors, optionally filtered by status.
   *
   * @example
   * ```ts
   * const monitors = await op.snipe.listMonitors('active');
   * ```
   */
  async listMonitors(status?: string): Promise<MonitorInfo[]> {
    const query: Record<string, string> = {};
    if (status !== undefined) query['status'] = status;
    return this._http.get<MonitorInfo[]>('/api/snipe-monitors/monitors', query);
  }
}
