import type { HttpClient } from '../http.js';

export type PriorityLevel = 'economy' | 'normal' | 'fast' | 'turbo';

// ---------------------------------------------------------------------------
// Pool types
// ---------------------------------------------------------------------------

export interface CreatePoolOptions {
  label: string;
  walletCount: number;
}

export interface PoolInfo {
  id: string;
  label: string;
  walletCount: number;
  walletIds: string[];
  createdAt: string;
}

export interface PoolStatus {
  pool: PoolInfo;
  wallets: Array<{
    walletId: string;
    publicKey: string;
    solBalance: string;
    tokenBalances: Array<{ mint: string; amount: string }>;
  }>;
  totals: {
    totalSol: number;
    totalTokens: Record<string, string>;
  };
}

export interface FundPoolOptions {
  sourceWalletId: string;
  totalAmountSol: number;
  hops?: number;
}

export interface FundPoolResult {
  jobId: string;
}

export interface ConsolidatePoolOptions {
  targetWalletId: string;
  mint?: string;
}

export interface ConsolidatePoolResult {
  swept: number;
  failed: number;
  totalSolRecovered: string;
}

// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

export interface SessionConfig {
  amountRange: [string, string];
  maxPositionSol: string;
  intervalRange?: [number, number];
  netBias?: number;
  slippageBps?: number;
  priorityLevel?: PriorityLevel;
  maxDrawdownPercent?: number;
  maxDurationMinutes?: number;
  volumeMode?: boolean;
  maxSupplyPercent?: number;
  maxSlippagePercent?: number;
  minLiquidity?: number;
  supportLevels?: string[];
  takeProfitLevels?: Array<{ price: string; sellPercent: number }>;
}

export interface StartSessionOptions {
  mint: string;
  config: SessionConfig;
  walletIds?: string[];
  walletPoolId?: string;
  costBasisLamports?: string;
}

export interface SessionInfo {
  id: string;
  mint: string;
  status: string;
  config: SessionConfig;
  stats: Record<string, unknown>;
  createdAt: string;
}

export interface SessionPnl {
  costBasis: string;
  realizedPnl: string;
  unrealizedPnl: string;
  roi: number;
  position: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// MarketMaking resource
// ---------------------------------------------------------------------------

export class MarketMaking {
  constructor(private readonly _http: HttpClient) {}

  // -----------------------------------------------------------------------
  // Pool methods
  // -----------------------------------------------------------------------

  /**
   * Create a new wallet pool with N wallets grouped under a label.
   *
   * @example
   * ```ts
   * const pool = await op.marketMaking.createPool({
   *   label: 'mm-pool-1',
   *   walletCount: 10,
   * });
   * console.log(pool.id);
   * ```
   */
  async createPool(options: CreatePoolOptions): Promise<PoolInfo> {
    return this._http.post<PoolInfo>('/api/market-making/pools', options);
  }

  /**
   * List all wallet pools for the authenticated user.
   *
   * @example
   * ```ts
   * const pools = await op.marketMaking.listPools();
   * ```
   */
  async listPools(): Promise<PoolInfo[]> {
    return this._http.get<PoolInfo[]>('/api/market-making/pools');
  }

  /**
   * Get aggregate status of a wallet pool including per-wallet balances.
   *
   * @example
   * ```ts
   * const status = await op.marketMaking.getPoolStatus('pool-id');
   * console.log(status.totals.totalSol);
   * ```
   */
  async getPoolStatus(poolId: string): Promise<PoolStatus> {
    return this._http.get<PoolStatus>(`/api/market-making/pools/${poolId}`);
  }

  /**
   * Distribute SOL from a source wallet to all wallets in a pool.
   * Returns a job ID for polling — use `op.jobs.poll()` to track progress.
   *
   * @example
   * ```ts
   * const { jobId } = await op.marketMaking.fundPool('pool-id', {
   *   sourceWalletId: 'wallet-id',
   *   totalAmountSol: 2.5,
   *   hops: 2,
   * });
   * const result = await op.jobs.poll(jobId);
   * ```
   */
  async fundPool(poolId: string, options: FundPoolOptions): Promise<FundPoolResult> {
    return this._http.post<FundPoolResult>(
      `/api/market-making/pools/${poolId}/fund`,
      options,
    );
  }

  /**
   * Sweep all funds from every wallet in a pool to a single target wallet.
   *
   * @example
   * ```ts
   * const result = await op.marketMaking.consolidatePool('pool-id', {
   *   targetWalletId: 'wallet-id',
   * });
   * console.log(result.totalSolRecovered);
   * ```
   */
  async consolidatePool(
    poolId: string,
    options: ConsolidatePoolOptions,
  ): Promise<ConsolidatePoolResult> {
    return this._http.post<ConsolidatePoolResult>(
      `/api/market-making/pools/${poolId}/consolidate`,
      options,
    );
  }

  // -----------------------------------------------------------------------
  // Session methods
  // -----------------------------------------------------------------------

  /**
   * Start a new market-making session on a PumpFun token.
   *
   * @example
   * ```ts
   * const session = await op.marketMaking.startSession({
   *   mint: 'So11...abc',
   *   config: {
   *     amountRange: ['5000000', '50000000'],
   *     maxPositionSol: '1000000000',
   *   },
   *   walletPoolId: 'pool-id',
   * });
   * console.log(session.id);
   * ```
   */
  async startSession(options: StartSessionOptions): Promise<SessionInfo> {
    return this._http.post<SessionInfo>('/api/market-making/sessions', options);
  }

  /**
   * Stop a running or paused market-making session.
   *
   * @example
   * ```ts
   * await op.marketMaking.stopSession('session-id');
   * ```
   */
  async stopSession(sessionId: string): Promise<void> {
    await this._http.post<void>(`/api/market-making/sessions/${sessionId}/stop`);
  }

  /**
   * Pause a running market-making session.
   *
   * @example
   * ```ts
   * await op.marketMaking.pauseSession('session-id');
   * ```
   */
  async pauseSession(sessionId: string): Promise<void> {
    await this._http.post<void>(`/api/market-making/sessions/${sessionId}/pause`);
  }

  /**
   * Resume a paused market-making session.
   *
   * @example
   * ```ts
   * await op.marketMaking.resumeSession('session-id');
   * ```
   */
  async resumeSession(sessionId: string): Promise<void> {
    await this._http.post<void>(`/api/market-making/sessions/${sessionId}/resume`);
  }

  /**
   * Get detailed status of a market-making session.
   *
   * @example
   * ```ts
   * const session = await op.marketMaking.getSessionStatus('session-id');
   * console.log(session.status, session.stats);
   * ```
   */
  async getSessionStatus(sessionId: string): Promise<SessionInfo> {
    return this._http.get<SessionInfo>(`/api/market-making/sessions/${sessionId}`);
  }

  /**
   * List all market-making sessions, optionally filtered by status.
   *
   * @example
   * ```ts
   * const sessions = await op.marketMaking.listSessions('active');
   * ```
   */
  async listSessions(status?: string): Promise<SessionInfo[]> {
    const query: Record<string, string> = {};
    if (status !== undefined) query['status'] = status;
    return this._http.get<SessionInfo[]>('/api/market-making/sessions', query);
  }

  /**
   * Hot-update strategy parameters on a running or paused session.
   *
   * @example
   * ```ts
   * await op.marketMaking.updateStrategy('session-id', {
   *   netBias: 0.7,
   *   intervalRange: [5, 20],
   * });
   * ```
   */
  async updateStrategy(
    sessionId: string,
    config: Partial<SessionConfig>,
  ): Promise<SessionInfo> {
    return this._http.patch<SessionInfo>(
      `/api/market-making/sessions/${sessionId}`,
      { config },
    );
  }

  /**
   * Get a detailed P&L report for a market-making session.
   *
   * @example
   * ```ts
   * const pnl = await op.marketMaking.getPnl('session-id');
   * console.log(`ROI: ${pnl.roi}%`);
   * ```
   */
  async getPnl(sessionId: string): Promise<SessionPnl> {
    return this._http.get<SessionPnl>(`/api/market-making/sessions/${sessionId}/pnl`);
  }
}
