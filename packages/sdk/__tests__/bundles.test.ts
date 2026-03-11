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

describe('Bundles', () => {
  let op: OpenPump;

  beforeEach(() => {
    op = new OpenPump({ apiKey: 'op_sk_test_123', baseUrl: 'http://localhost:3001' });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('launch() sends POST with bundle launch options', async () => {
    const launchResult = { jobId: 'job123' };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: launchResult }));

    const result = await op.bundles.launch({
      devWalletId: 'w1',
      buyWalletIds: ['w2', 'w3'],
      name: 'Bundle Token',
      symbol: 'BT',
      imageBase64: 'base64data',
      imageType: 'image/png',
      walletBuyAmounts: ['500000000', '500000000'],
    });
    expect(result).toEqual(launchResult);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/tokens/bundle-launch',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('launch() includes optional fields', async () => {
    const launchResult = { jobId: 'job456' };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: launchResult }));

    await op.bundles.launch({
      devWalletId: 'w1',
      buyWalletIds: ['w2'],
      name: 'Full Token',
      symbol: 'FT',
      description: 'A fully-configured token',
      imageBase64: 'base64data',
      imageType: 'image/jpeg',
      devBuyAmountLamports: '100000000',
      walletBuyAmounts: ['500000000'],
      tipLamports: 10000,
      twitter: '@fulltoken',
      telegram: 't.me/fulltoken',
      website: 'https://fulltoken.com',
    });

    // Verify the body includes all fields
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs).toBeDefined();
    const requestInit = callArgs?.[1] as RequestInit;
    const body = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(body['description']).toBe('A fully-configured token');
    expect(body['devBuyAmountLamports']).toBe('100000000');
    expect(body['tipLamports']).toBe(10000);
    expect(body['twitter']).toBe('@fulltoken');
  });
});
