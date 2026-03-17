import type { HttpClient } from '../http.js';

export interface CreateWalletOptions {
  label?: string;
}

export interface WalletInfo {
  id: string;
  publicKey: string;
  walletIndex: number;
  label: string;
  createdAt: string;
}

export interface WalletBalance {
  nativeSol: { lamports: string; sol: string };
  tokens: Array<{
    mint: string;
    symbol: string | null;
    amount: string;
    decimals: number;
    uiAmount: number;
  }>;
}

export interface DepositInstructions {
  depositAddress: string;
  minimums: { tokenCreation: string; bundleBuy: string; standardBuy: string };
  instructions: string[];
  disclaimer: string;
  network: string;
}

export interface TransferOptions {
  toAddress: string;
  amountLamports: string;
  mint?: string | null;
  memo?: string;
  priorityFeeMicroLamports?: number;
}

export interface TransferResult {
  signature: string;
  amountLamports: string;
  fee: string;
}

export interface TransactionListOptions {
  type?: 'buy' | 'sell' | 'transfer';
  limit?: number;
  offset?: number;
}

export interface TransactionListResult {
  transactions: Array<Record<string, unknown>>;
  total: number;
  limit: number;
  offset: number;
}

export interface BatchCreateOptions {
  count: number;
  labelPrefix?: string;
}

export interface BatchCreateResult {
  wallets: WalletInfo[];
  created: number;
  failed: number;
}

export interface AggregateBalance {
  totalSol: string;
  totalLamports: string;
  walletCount: number;
}

export interface ImportWalletOptions {
  privateKey: string;
  label?: string;
}

export interface ExportPrivateKeyOptions {
  password: string;
}

export interface ExportPrivateKeyResult {
  privateKey: string;
}

export class Wallets {
  constructor(private readonly _http: HttpClient) {}

  /** List all active wallets for the authenticated user. */
  async list(): Promise<WalletInfo[]> {
    return this._http.get<WalletInfo[]>('/api/wallets');
  }

  /** Create a new wallet with an optional label. */
  async create(options?: CreateWalletOptions): Promise<WalletInfo> {
    return this._http.post<WalletInfo>('/api/wallets', options ?? {});
  }

  /** Get a single wallet by ID. */
  async get(walletId: string): Promise<WalletInfo> {
    return this._http.get<WalletInfo>(`/api/wallets/${walletId}`);
  }

  /** Get SOL + token balances for a wallet. */
  async getBalance(walletId: string): Promise<WalletBalance> {
    return this._http.get<WalletBalance>(`/api/wallets/${walletId}/balance`);
  }

  /** Get deposit address and SOL minimums for a wallet. */
  async getDepositInstructions(walletId: string): Promise<DepositInstructions> {
    return this._http.get<DepositInstructions>(`/api/wallets/${walletId}/deposit-instructions`);
  }

  /** Force a live RPC balance refresh, bypassing the 30s cache. */
  async refreshBalance(walletId: string): Promise<WalletBalance> {
    return this._http.post<WalletBalance>(`/api/wallets/${walletId}/refresh-balance`);
  }

  /**
   * Execute an on-chain SOL or SPL token transfer.
   *
   * @example
   * ```ts
   * const result = await op.wallets.transfer('wallet-id', {
   *   toAddress: 'recipient-public-key',
   *   amountLamports: '100000000',
   * });
   * console.log(result.signature);
   * ```
   */
  async transfer(walletId: string, options: TransferOptions): Promise<TransferResult> {
    return this._http.post<TransferResult>(`/api/wallets/${walletId}/transfer`, options);
  }

  /** Get paginated transfer history for a wallet. */
  async getTransactions(
    walletId: string,
    options?: TransactionListOptions,
  ): Promise<TransactionListResult> {
    const query: Record<string, string> = {};
    if (options?.type !== undefined) query['type'] = options.type;
    if (options?.limit !== undefined) query['limit'] = String(options.limit);
    if (options?.offset !== undefined) query['offset'] = String(options.offset);
    return this._http.get<TransactionListResult>(`/api/wallets/${walletId}/transactions`, query);
  }

  /**
   * Create multiple wallets in a single call (2--50).
   *
   * @example
   * ```ts
   * const result = await op.wallets.batchCreate({
   *   count: 5,
   *   labelPrefix: 'sniper',
   * });
   * console.log(result.wallets.length);
   * ```
   */
  async batchCreate(options: BatchCreateOptions): Promise<BatchCreateResult> {
    return this._http.post<BatchCreateResult>('/api/wallets/batch', options);
  }

  /**
   * Get the total SOL balance across all wallets.
   *
   * @example
   * ```ts
   * const agg = await op.wallets.getAggregateBalance();
   * console.log(`Total: ${agg.totalSol} SOL across ${agg.walletCount} wallets`);
   * ```
   */
  async getAggregateBalance(): Promise<AggregateBalance> {
    return this._http.get<AggregateBalance>('/api/wallets/aggregate-balance');
  }

  /**
   * Import an existing Solana wallet by providing its private key.
   *
   * @example
   * ```ts
   * const wallet = await op.wallets.importWallet({
   *   privateKey: 'base58-encoded-key...',
   *   label: 'my-phantom-wallet',
   * });
   * console.log(wallet.publicKey);
   * ```
   */
  async importWallet(options: ImportWalletOptions): Promise<WalletInfo> {
    return this._http.post<WalletInfo>('/api/wallets/import', options);
  }

  /**
   * Export a wallet's private key. Requires password re-authentication.
   *
   * @example
   * ```ts
   * const result = await op.wallets.exportPrivateKey('wallet-id', {
   *   password: 'your-password',
   * });
   * console.log(result.privateKey);
   * ```
   */
  async exportPrivateKey(
    walletId: string,
    options: ExportPrivateKeyOptions,
  ): Promise<ExportPrivateKeyResult> {
    return this._http.post<ExportPrivateKeyResult>(
      `/api/wallets/${walletId}/export-private-key`,
      options,
    );
  }
}
