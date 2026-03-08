import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';
import { buyTokenAction } from '../actions/buy-token.js';
import { sellTokenAction } from '../actions/sell-token.js';
import { createTokenAction } from '../actions/create-token.js';
import { getTokenInfoAction } from '../actions/get-token-info.js';
import { listWalletsAction } from '../actions/list-wallets.js';
import { getBalanceAction } from '../actions/get-balance.js';
import { bundleBuyAction } from '../actions/bundle-buy.js';
import { sellAllAction } from '../actions/sell-all.js';
import { clearClientCache } from '../plugin.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockRuntime(settings: Record<string, string | undefined> = {}): IAgentRuntime {
  return {
    agentId: 'test-agent-123',
    getSetting: vi.fn((key: string) => settings[key]),
    getService: vi.fn(),
  } as unknown as IAgentRuntime;
}

function createMockMessage(content: Record<string, unknown>): Memory {
  return {
    entityId: 'user-123',
    roomId: 'room-123',
    content: { text: 'test message', ...content },
  } as unknown as Memory;
}

// ── validate() tests ────────────────────────────────────────────────────────────

describe('Action validate()', () => {
  const actions = [
    { name: 'buyTokenAction', action: buyTokenAction },
    { name: 'sellTokenAction', action: sellTokenAction },
    { name: 'createTokenAction', action: createTokenAction },
    { name: 'getTokenInfoAction', action: getTokenInfoAction },
    { name: 'listWalletsAction', action: listWalletsAction },
    { name: 'getBalanceAction', action: getBalanceAction },
    { name: 'bundleBuyAction', action: bundleBuyAction },
    { name: 'sellAllAction', action: sellAllAction },
  ];

  for (const { name, action } of actions) {
    describe(name, () => {
      it('returns true when OPENPUMP_API_KEY is configured', async () => {
        const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });
        expect(await action.validate(runtime, createMockMessage({}), {} as State)).toBe(true);
      });

      it('returns false when OPENPUMP_API_KEY is missing', async () => {
        const runtime = createMockRuntime({});
        expect(await action.validate(runtime, createMockMessage({}), {} as State)).toBe(false);
      });

      it('returns false when OPENPUMP_API_KEY is empty string', async () => {
        const runtime = createMockRuntime({ OPENPUMP_API_KEY: '' });
        expect(await action.validate(runtime, createMockMessage({}), {} as State)).toBe(false);
      });
    });
  }
});

// ── buyTokenAction handler tests ────────────────────────────────────────────────

describe('buyTokenAction handler', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearClientCache();
  });

  it('returns success on valid buy', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });
    const message = createMockMessage({
      walletId: 'wallet-uuid-1',
      mint: 'SomeTokenMint111',
      amountLamports: '100000000',
    });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ signature: 'sig_abc123' }), { status: 200 }),
    );

    const callback = vi.fn();
    const result = await buyTokenAction.handler(runtime, message, undefined, undefined, callback);

    expect(result).toHaveProperty('success', true);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('sig_abc123') }),
    );
  });

  it('returns error when missing parameters', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });
    const message = createMockMessage({});

    const callback = vi.fn();
    const result = await buyTokenAction.handler(runtime, message, undefined, undefined, callback);

    expect(result).toHaveProperty('success', false);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('wallet ID') }),
    );
  });

  it('returns error on API failure', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });
    const message = createMockMessage({
      walletId: 'wallet-1',
      mint: 'TokenMint',
      amountLamports: '100000000',
    });

    mockFetch.mockResolvedValueOnce(
      new Response('Insufficient balance', { status: 400 }),
    );

    const callback = vi.fn();
    const result = await buyTokenAction.handler(runtime, message, undefined, undefined, callback);

    expect(result).toHaveProperty('success', false);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Buy failed') }),
    );
  });
});

// ── sellTokenAction handler tests ───────────────────────────────────────────────

describe('sellTokenAction handler', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearClientCache();
  });

  it('returns success on valid sell', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });
    const message = createMockMessage({
      walletId: 'wallet-uuid-2',
      mint: 'TokenMint222',
      tokenAmount: 'all',
    });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ signature: 'sig_sell_456' }), { status: 200 }),
    );

    const callback = vi.fn();
    const result = await sellTokenAction.handler(runtime, message, undefined, undefined, callback);

    expect(result).toHaveProperty('success', true);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('sig_sell_456') }),
    );
  });

  it('returns error when missing mint', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });
    const message = createMockMessage({ walletId: 'wallet-1' });

    const callback = vi.fn();
    const result = await sellTokenAction.handler(runtime, message, undefined, undefined, callback);

    expect(result).toHaveProperty('success', false);
  });
});

// ── getTokenInfoAction handler tests ────────────────────────────────────────────

describe('getTokenInfoAction handler', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearClientCache();
  });

  it('returns token info on success', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });
    const message = createMockMessage({ mint: 'TokenMintABC' });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        name: 'TestToken',
        symbol: 'TST',
        priceSOL: '0.001',
        marketCapSOL: '100.5',
        bondingCurveProgress: '45.2',
        graduated: false,
      }), { status: 200 }),
    );

    const callback = vi.fn();
    const result = await getTokenInfoAction.handler(runtime, message, undefined, undefined, callback);

    expect(result).toHaveProperty('success', true);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('TestToken') }),
    );
  });

  it('returns 404 message for unknown token', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });
    const message = createMockMessage({ mint: 'UnknownMint' });

    mockFetch.mockResolvedValueOnce(
      new Response('Not found', { status: 404 }),
    );

    const callback = vi.fn();
    const result = await getTokenInfoAction.handler(runtime, message, undefined, undefined, callback);

    expect(result).toHaveProperty('success', false);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('not found') }),
    );
  });
});

// ── listWalletsAction handler tests ─────────────────────────────────────────────

describe('listWalletsAction handler', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearClientCache();
  });

  it('returns wallet list on success', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });
    const message = createMockMessage({});

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [
          { id: 'w1', publicKey: 'pk1', label: 'sniper', walletIndex: 0 },
          { id: 'w2', publicKey: 'pk2', label: null, walletIndex: 1 },
        ],
      }), { status: 200 }),
    );

    const callback = vi.fn();
    const result = await listWalletsAction.handler(runtime, message, undefined, undefined, callback);

    expect(result).toHaveProperty('success', true);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('sniper') }),
    );
  });
});

// ── getBalanceAction handler tests ──────────────────────────────────────────────

describe('getBalanceAction handler', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearClientCache();
  });

  it('returns balance on success', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });
    const message = createMockMessage({ walletId: 'w1' });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: {
          solBalance: '2.5',
          lamports: '2500000000',
          tokenBalances: [{ mint: 'TokenA', amount: '500000', uiAmount: 0.5, decimals: 6 }],
        },
      }), { status: 200 }),
    );

    const callback = vi.fn();
    const result = await getBalanceAction.handler(runtime, message, undefined, undefined, callback);

    expect(result).toHaveProperty('success', true);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('2.5') }),
    );
  });

  it('returns error when walletId missing', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });
    const message = createMockMessage({});

    const callback = vi.fn();
    const result = await getBalanceAction.handler(runtime, message, undefined, undefined, callback);

    expect(result).toHaveProperty('success', false);
  });
});

// ── sellAllAction handler tests ─────────────────────────────────────────────────

describe('sellAllAction handler', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearClientCache();
  });

  it('sells from all holding wallets', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });
    const message = createMockMessage({ mint: 'TokenMintXYZ' });

    // Mock wallet list
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [
          { id: 'w1', publicKey: 'pk1', label: 'sniper' },
          { id: 'w2', publicKey: 'pk2', label: null },
        ],
      }), { status: 200 }),
    );

    // Mock balance for w1 (holds token)
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: {
          tokenBalances: [{ mint: 'TokenMintXYZ', amount: '1000000', uiAmount: 1.0 }],
        },
      }), { status: 200 }),
    );

    // Mock balance for w2 (does not hold token)
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: { tokenBalances: [] },
      }), { status: 200 }),
    );

    // Mock sell for w1
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ signature: 'sig_sell_all' }), { status: 200 }),
    );

    const callback = vi.fn();
    const result = await sellAllAction.handler(runtime, message, undefined, undefined, callback);

    expect(result).toHaveProperty('success', true);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('sig_sell_all') }),
    );
  });

  it('reports no holders when no wallets hold the token', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });
    const message = createMockMessage({ mint: 'NoOneMint' });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [{ id: 'w1', publicKey: 'pk1', label: null }],
      }), { status: 200 }),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: { tokenBalances: [] },
      }), { status: 200 }),
    );

    const callback = vi.fn();
    const result = await sellAllAction.handler(runtime, message, undefined, undefined, callback);

    expect(result).toHaveProperty('success', true);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Nothing to sell') }),
    );
  });
});
