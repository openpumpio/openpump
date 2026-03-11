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

describe('Trading', () => {
  let op: OpenPump;

  beforeEach(() => {
    op = new OpenPump({ apiKey: 'op_sk_test_123', baseUrl: 'http://localhost:3001' });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getQuote() sends GET with query params', async () => {
    const quote = {
      route: 'bonding_curve' as const,
      expectedTokens: '1000000',
      priceImpact: 0.5,
      fee: 0.01,
      disclaimer: 'Test disclaimer',
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: quote }));

    const result = await op.trading.getQuote('mint123', {
      action: 'buy',
      solAmount: '1000000000',
    });
    expect(result).toEqual(quote);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/tokens/mint123/quote'),
      expect.anything(),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('action=buy'),
      expect.anything(),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('solAmount=1000000000'),
      expect.anything(),
    );
  });

  it('getQuoteBuyCost() returns SOL cost estimate', async () => {
    const quoteCost = {
      solCostLamports: '500000000',
      route: 'bonding_curve' as const,
      disclaimer: 'Test',
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: quoteCost }));

    const result = await op.trading.getQuoteBuyCost('mint123', {
      tokenAmount: '1000000',
    });
    expect(result).toEqual(quoteCost);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('tokenAmount=1000000'),
      expect.anything(),
    );
  });

  it('buy() sends POST with buy options', async () => {
    const buyResult = {
      signature: 'sig123',
      estimatedTokenAmount: '1000000',
      solSpent: '500000000',
      route: 'bonding_curve' as const,
      disclaimer: 'Test',
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: buyResult }));

    const result = await op.trading.buy('mint123', {
      walletId: 'w1',
      amountLamports: '500000000',
      slippageBps: 500,
    });
    expect(result).toEqual(buyResult);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/tokens/mint123/buy',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sell() sends POST with sell options', async () => {
    const sellResult = {
      signature: 'sig456',
      estimatedSolReceived: '400000000',
      tokensSold: '1000000',
      route: 'bonding_curve' as const,
      disclaimer: 'Test',
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: sellResult }));

    const result = await op.trading.sell('mint123', {
      walletId: 'w1',
      tokenAmount: 'all',
    });
    expect(result).toEqual(sellResult);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/tokens/mint123/sell',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('bundleSell() sends POST with multi-wallet sell options', async () => {
    const bundleResult = {
      bundleResults: [
        {
          bundleId: 'b1',
          status: 'Landed' as const,
          signatures: ['sig1', 'sig2'],
          walletsIncluded: ['w1', 'w2'],
        },
      ],
      warnings: [],
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: bundleResult }));

    const result = await op.trading.bundleSell('mint123', {
      walletSells: [
        { walletId: 'w1', tokenAmount: 'all' },
        { walletId: 'w2', tokenAmount: '500000' },
      ],
    });
    expect(result).toEqual(bundleResult);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/tokens/mint123/bundle-sell',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
