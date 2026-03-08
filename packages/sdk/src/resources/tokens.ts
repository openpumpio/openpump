import type { HttpClient } from '../http.js';

export interface CreateTokenOptions {
  walletIndex?: number;
  name: string;
  symbol: string;
  description: string;
  imageBase64: string;
  imageType: 'image/png' | 'image/jpeg' | 'image/jpg' | 'image/gif' | 'image/webp';
  initialBuyAmountSol?: number;
  twitter?: string;
  telegram?: string;
  website?: string;
}

export interface CreateTokenResult {
  tokenId: string;
  mint: string;
  signature: string;
  metadataUri: string;
  bondingCurveAccount: string;
}

export interface TokenListItem {
  id: string;
  mintAddress: string;
  name: string;
  symbol: string;
  graduationStatus: string;
  metadataUri: string;
  creatorAddress: string;
  createdAt: string;
}

export interface CurveState {
  mint: string;
  virtualTokenReserves: string;
  virtualSolReserves: string;
  realTokenReserves: string;
  realSolReserves: string;
  tokenTotalSupply: string;
  complete: boolean;
  isMayhemMode: boolean;
  currentPriceSOL: number;
  marketCapSOL: number;
  graduationPercent: number;
}

export class Tokens {
  constructor(private readonly _http: HttpClient) {}

  /** List tokens created by the authenticated user. */
  async list(): Promise<TokenListItem[]> {
    return this._http.get<TokenListItem[]>('/api/tokens');
  }

  /**
   * Create a new PumpFun token with IPFS metadata upload.
   *
   * @example
   * ```ts
   * const token = await op.tokens.create({
   *   name: 'My Token',
   *   symbol: 'MTK',
   *   description: 'A cool token',
   *   imageBase64: 'base64-encoded-image...',
   *   imageType: 'image/png',
   * });
   * console.log(token.mint);
   * ```
   */
  async create(options: CreateTokenOptions): Promise<CreateTokenResult> {
    return this._http.post<CreateTokenResult>('/api/tokens/create', options);
  }

  /** Get market info for a token (mainnet only, returns null on devnet). */
  async getMarketInfo(mint: string): Promise<Record<string, unknown> | null> {
    return this._http.get<Record<string, unknown> | null>(`/api/tokens/${mint}/market-info`);
  }

  /** Get bonding curve state including price, market cap, and graduation progress. */
  async getCurveState(mint: string): Promise<CurveState> {
    return this._http.get<CurveState>(`/api/tokens/${mint}/curve-state`);
  }
}
