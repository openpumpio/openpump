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

describe('Tokens', () => {
  let op: OpenPump;

  beforeEach(() => {
    op = new OpenPump({ apiKey: 'op_sk_test_123', baseUrl: 'http://localhost:3001' });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('list() returns array of tokens', async () => {
    const tokens = [
      {
        id: 't1',
        mintAddress: 'mint123',
        name: 'TestToken',
        symbol: 'TT',
        graduationStatus: 'active',
        metadataUri: 'https://example.com/meta',
        creatorAddress: 'creator123',
        createdAt: '2024-01-01',
      },
    ];
    mockFetch.mockResolvedValueOnce(mockResponse({ data: tokens }));

    const result = await op.tokens.list();
    expect(result).toEqual(tokens);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/tokens',
      expect.objectContaining({
        headers: { Authorization: 'Bearer op_sk_test_123' },
      }),
    );
  });

  it('create() sends POST with token options', async () => {
    const created = {
      tokenId: 't2',
      mint: 'mint456',
      signature: 'sig456',
      metadataUri: 'https://example.com/meta2',
      bondingCurveAccount: 'curve456',
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: created }));

    const result = await op.tokens.create({
      name: 'New Token',
      symbol: 'NT',
      description: 'A new token',
      imageBase64: 'base64data',
      imageType: 'image/png',
    });
    expect(result).toEqual(created);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/tokens/create',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('getMarketInfo() returns market data for a token', async () => {
    const marketInfo = { price: 0.001, volume24h: 1000 };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: marketInfo }));

    const result = await op.tokens.getMarketInfo('mint123');
    expect(result).toEqual(marketInfo);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/tokens/mint123/market-info',
      expect.anything(),
    );
  });

  it('getCurveState() returns bonding curve state', async () => {
    const curveState = {
      mint: 'mint123',
      virtualTokenReserves: '1000000',
      virtualSolReserves: '1000000',
      realTokenReserves: '500000',
      realSolReserves: '500000',
      tokenTotalSupply: '1000000000',
      complete: false,
      isMayhemMode: false,
      currentPriceSOL: 0.0001,
      marketCapSOL: 100,
      graduationPercent: 50,
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: curveState }));

    const result = await op.tokens.getCurveState('mint123');
    expect(result).toEqual(curveState);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/tokens/mint123/curve-state',
      expect.anything(),
    );
  });
});
