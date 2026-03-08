import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IAgentRuntime, Memory, State } from '@elizaos/core';
import { walletProvider } from '../providers/wallet-provider.js';
import { clearClientCache } from '../plugin.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockRuntime(settings: Record<string, string | undefined> = {}): IAgentRuntime {
  return {
    agentId: 'test-agent-wallet-provider',
    getSetting: vi.fn((key: string) => settings[key]),
    getService: vi.fn(),
  } as unknown as IAgentRuntime;
}

function createMockMessage(): Memory {
  return {
    entityId: 'user-123',
    roomId: 'room-123',
    content: { text: 'show portfolio' },
  } as unknown as Memory;
}

describe('walletProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearClientCache();
  });

  it('returns empty text when OPENPUMP_API_KEY is not configured', async () => {
    const runtime = createMockRuntime({});
    const result = await walletProvider.get(runtime, createMockMessage(), {} as State);

    expect(result).toHaveProperty('text', '');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('values');
  });

  it('returns "No wallets configured" when wallet list is empty', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    const result = await walletProvider.get(runtime, createMockMessage(), {} as State);

    expect(result).toHaveProperty('text', 'OpenPump Portfolio: No wallets configured.');
    expect(result.values).toHaveProperty('walletCount', 0);
  });

  it('returns portfolio summary for wallets with balances', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });

    // Mock wallet list
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [
          { id: 'w1', publicKey: 'pk1', label: 'sniper', walletIndex: 0 },
          { id: 'w2', publicKey: 'pk2', label: null, walletIndex: 1 },
        ],
      }), { status: 200 }),
    );

    // Mock balance for w1
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: {
          solBalance: '1.5000',
          lamports: '1500000000',
          tokenBalances: [
            { mint: 'TokenA', amount: '500000', uiAmount: 0.5, decimals: 6 },
          ],
        },
      }), { status: 200 }),
    );

    // Mock balance for w2
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: {
          solBalance: '0.2500',
          lamports: '250000000',
          tokenBalances: [],
        },
      }), { status: 200 }),
    );

    const result = await walletProvider.get(runtime, createMockMessage(), {} as State);

    expect(result.text).toContain('OpenPump Portfolio:');
    expect(result.text).toContain('sniper');
    expect(result.text).toContain('1.5000 SOL');
    expect(result.text).toContain('0.2500 SOL');
    expect(result.text).toContain('TokenA');
    expect(result.text).toContain('0.5');
    expect(result.text).toContain('1.7500 SOL across 2 wallets');
    expect(result.text).toContain('1 token positions');
    expect(result.values).toHaveProperty('walletCount', 2);
    expect(result.values).toHaveProperty('totalTokenPositions', 1);
  });

  it('handles wallet list API failure gracefully', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });

    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const result = await walletProvider.get(runtime, createMockMessage(), {} as State);

    expect(result.text).toContain('Unable to fetch wallets');
  });

  it('handles individual balance fetch failures gracefully', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });

    // Mock wallet list
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [
          { id: 'w1', publicKey: 'pk1', label: null, walletIndex: 0 },
          { id: 'w2', publicKey: 'pk2', label: null, walletIndex: 1 },
        ],
      }), { status: 200 }),
    );

    // w1 balance succeeds
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: {
          solBalance: '3.0000',
          lamports: '3000000000',
          tokenBalances: [],
        },
      }), { status: 200 }),
    );

    // w2 balance fails
    mockFetch.mockResolvedValueOnce(
      new Response('Service Unavailable', { status: 503 }),
    );

    const result = await walletProvider.get(runtime, createMockMessage(), {} as State);

    // Should still include the successful wallet
    expect(result.text).toContain('3.0000 SOL');
    expect(result.values).toHaveProperty('walletCount', 2);
  });

  it('handles fetch network errors gracefully', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await walletProvider.get(runtime, createMockMessage(), {} as State);

    expect(result.text).toContain('Portfolio fetch failed');
    expect(result.text).toContain('Network error');
  });

  it('skips token positions with zero balance', async () => {
    const runtime = createMockRuntime({ OPENPUMP_API_KEY: 'op_sk_test_123' });

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [{ id: 'w1', publicKey: 'pk1', label: null, walletIndex: 0 }],
      }), { status: 200 }),
    );

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: {
          solBalance: '1.0000',
          lamports: '1000000000',
          tokenBalances: [
            { mint: 'TokenX', amount: '0', uiAmount: 0, decimals: 6 },
            { mint: 'TokenY', amount: '100', uiAmount: null, decimals: 6 },
          ],
        },
      }), { status: 200 }),
    );

    const result = await walletProvider.get(runtime, createMockMessage(), {} as State);

    // TokenX with 0 balance should not appear
    expect(result.text).not.toContain('TokenX');
    // TokenY with null uiAmount should not appear (null is not > 0)
    expect(result.text).not.toContain('TokenY');
    expect(result.values).toHaveProperty('totalTokenPositions', 0);
  });

  it('has correct metadata properties', () => {
    expect(walletProvider.name).toBe('openpumpWalletProvider');
    expect(walletProvider.dynamic).toBe(true);
    expect(walletProvider.position).toBe(10);
    expect(walletProvider.description).toContain('wallet balances');
  });
});
