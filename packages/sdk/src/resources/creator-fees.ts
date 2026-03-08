import type { HttpClient } from '../http.js';

export interface AccumulatedFees {
  creatorAddress: string;
  accumulatedLamports: string;
  accumulatedSOL: number;
  creatorVaultAddress: string;
}

export interface ClaimFeesResult {
  signature: string;
  amountClaimed: string;
  amountClaimedSOL: number;
}

export class CreatorFees {
  constructor(private readonly _http: HttpClient) {}

  /** Get accumulated creator fees for a given creator address. */
  async getAccumulatedFees(address: string): Promise<AccumulatedFees> {
    return this._http.get<AccumulatedFees>('/api/creator-fees', { address });
  }

  /** Claim accumulated creator fees for a wallet you own. */
  async claim(creatorAddress: string): Promise<ClaimFeesResult> {
    return this._http.post<ClaimFeesResult>('/api/creator-fees/claim', { creatorAddress });
  }
}
