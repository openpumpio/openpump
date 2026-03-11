import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenPump } from '../src/index.js';
import { AuthenticationError, NotFoundError } from '../src/errors.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as Response;
}

describe('Wallets', () => {
  let op: OpenPump;

  beforeEach(() => {
    op = new OpenPump({ apiKey: 'op_sk_test_123', baseUrl: 'http://localhost:3001' });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('list() returns array of wallets', async () => {
    const wallets = [
      { id: 'w1', publicKey: 'abc', walletIndex: 0, label: 'Main', createdAt: '2024-01-01' },
    ];
    mockFetch.mockResolvedValueOnce(mockResponse({ data: wallets }));

    const result = await op.wallets.list();
    expect(result).toEqual(wallets);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/wallets',
      expect.objectContaining({
        headers: { Authorization: 'Bearer op_sk_test_123' },
      }),
    );
  });

  it('create() sends POST with label', async () => {
    const created = { id: 'w2', publicKey: 'def', walletIndex: 1, label: 'Sniper', createdAt: '2024-01-01' };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: created }));

    const result = await op.wallets.create({ label: 'Sniper' });
    expect(result).toEqual(created);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/wallets',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('create() sends POST with empty object when no options', async () => {
    const created = { id: 'w3', publicKey: 'ghi', walletIndex: 2, label: '', createdAt: '2024-01-01' };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: created }));

    const result = await op.wallets.create();
    expect(result).toEqual(created);
  });

  it('get() fetches a single wallet by ID', async () => {
    const wallet = { id: 'w1', publicKey: 'abc', walletIndex: 0, label: 'Main', createdAt: '2024-01-01' };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: wallet }));

    const result = await op.wallets.get('w1');
    expect(result).toEqual(wallet);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/wallets/w1',
      expect.objectContaining({
        headers: { Authorization: 'Bearer op_sk_test_123' },
      }),
    );
  });

  it('getBalance() returns balance data', async () => {
    const balance = {
      nativeSol: { lamports: '1000000000', sol: '1.0' },
      tokens: [],
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: balance }));

    const result = await op.wallets.getBalance('w1');
    expect(result).toEqual(balance);
  });

  it('getDepositInstructions() returns deposit info', async () => {
    const deposit = {
      depositAddress: 'abc123',
      minimums: { tokenCreation: '0.02', bundleBuy: '0.05', standardBuy: '0.01' },
      instructions: ['Send SOL to the deposit address'],
      disclaimer: 'Test disclaimer',
      network: 'devnet',
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: deposit }));

    const result = await op.wallets.getDepositInstructions('w1');
    expect(result).toEqual(deposit);
  });

  it('refreshBalance() sends POST', async () => {
    const balance = {
      nativeSol: { lamports: '2000000000', sol: '2.0' },
      tokens: [],
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: balance }));

    const result = await op.wallets.refreshBalance('w1');
    expect(result).toEqual(balance);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/wallets/w1/refresh-balance',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('transfer() sends POST with options', async () => {
    const transferResult = { signature: 'sig123', amountLamports: '100000000', fee: '5000' };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: transferResult }));

    const result = await op.wallets.transfer('w1', {
      toAddress: 'recipient123',
      amountLamports: '100000000',
    });
    expect(result).toEqual(transferResult);
  });

  it('getTransactions() sends query params', async () => {
    const txResult = { transactions: [], total: 0, limit: 20, offset: 0 };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: txResult }));

    await op.wallets.getTransactions('w1', { type: 'buy', limit: 10, offset: 5 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('type=buy'),
      expect.anything(),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=10'),
      expect.anything(),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('offset=5'),
      expect.anything(),
    );
  });

  it('getTransactions() works without options', async () => {
    const txResult = { transactions: [], total: 0, limit: 20, offset: 0 };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: txResult }));

    const result = await op.wallets.getTransactions('w1');
    expect(result).toEqual(txResult);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/wallets/w1/transactions',
      expect.anything(),
    );
  });

  it('getBalance() throws NotFoundError for 404', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ error: 'WALLET_NOT_FOUND', message: 'Wallet not found' }, 404),
    );

    await expect(op.wallets.getBalance('nonexistent')).rejects.toThrow(NotFoundError);
  });

  it('list() throws AuthenticationError for 401', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ error: 'UNAUTHORIZED', message: 'Invalid API key' }, 401),
    );

    await expect(op.wallets.list()).rejects.toThrow(AuthenticationError);
  });
});
