import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenPump } from '../src/index.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as Response;
}

describe('CreatorFees', () => {
  let op: OpenPump;

  beforeEach(() => {
    op = new OpenPump({ apiKey: 'op_sk_test_123', baseUrl: 'http://localhost:3001' });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getAccumulatedFees() sends GET with address query', async () => {
    const fees = {
      creatorAddress: 'creator123',
      accumulatedLamports: '5000000000',
      accumulatedSOL: 5.0,
      creatorVaultAddress: 'vault123',
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: fees }));

    const result = await op.creatorFees.getAccumulatedFees('creator123');
    expect(result).toEqual(fees);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/creator-fees'),
      expect.anything(),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('address=creator123'),
      expect.anything(),
    );
  });

  it('claim() sends POST with creatorAddress', async () => {
    const claimResult = {
      signature: 'sig789',
      amountClaimed: '5000000000',
      amountClaimedSOL: 5.0,
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: claimResult }));

    const result = await op.creatorFees.claim('creator123');
    expect(result).toEqual(claimResult);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/creator-fees/claim',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
