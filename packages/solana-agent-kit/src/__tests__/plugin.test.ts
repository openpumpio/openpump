import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenPumpPlugin } from '../plugin.js';
import { buyTokenAction } from '../actions/buy-token.js';
import { sellTokenAction } from '../actions/sell-token.js';
import { createTokenAction } from '../actions/create-token.js';
import { getTokenInfoAction } from '../actions/get-token-info.js';
import { listWalletsAction } from '../actions/list-wallets.js';
import { createWalletAction } from '../actions/create-wallet.js';
import { getBalanceAction } from '../actions/get-balance.js';
import { bundleBuyAction } from '../actions/bundle-buy.js';
import type { Action } from 'solana-agent-kit';

/**
 * Create a mock SolanaAgentKit-like object for testing.
 * We only need the config property for plugin initialization.
 */
function createMockAgent(configOverrides: Record<string, string> = {}) {
  return {
    config: {
      OPENPUMP_API_KEY: 'op_sk_test_123',
      ...configOverrides,
    },
    wallet: null,
    connection: null,
    methods: {} as Record<string, unknown>,
    actions: [] as Action[],
  } as Record<string, unknown>;
}

describe('OpenPumpPlugin', () => {
  it('has correct name', () => {
    expect(OpenPumpPlugin.name).toBe('openpump');
  });

  it('exports 8 actions', () => {
    expect(OpenPumpPlugin.actions).toHaveLength(8);
  });

  it('exports methods for each action', () => {
    expect(OpenPumpPlugin.methods).toHaveProperty('openpumpBuyToken');
    expect(OpenPumpPlugin.methods).toHaveProperty('openpumpSellToken');
    expect(OpenPumpPlugin.methods).toHaveProperty('openpumpCreateToken');
    expect(OpenPumpPlugin.methods).toHaveProperty('openpumpGetTokenInfo');
    expect(OpenPumpPlugin.methods).toHaveProperty('openpumpListWallets');
    expect(OpenPumpPlugin.methods).toHaveProperty('openpumpCreateWallet');
    expect(OpenPumpPlugin.methods).toHaveProperty('openpumpGetBalance');
    expect(OpenPumpPlugin.methods).toHaveProperty('openpumpBundleBuy');
  });

  it('initialize() stores API client on agent', () => {
    const agent = createMockAgent();
    OpenPumpPlugin.initialize(agent as never);
    expect(agent['__openpumpClient']).toBeDefined();
    const client = agent['__openpumpClient'] as Record<string, unknown>;
    expect(typeof client['get']).toBe('function');
    expect(typeof client['post']).toBe('function');
  });

  it('initialize() throws when OPENPUMP_API_KEY is missing', () => {
    const agent = createMockAgent();
    const config = agent['config'] as Record<string, unknown>;
    delete config['OPENPUMP_API_KEY'];
    expect(() => OpenPumpPlugin.initialize(agent as never)).toThrow('OPENPUMP_API_KEY');
  });

  it('initialize() throws when OPENPUMP_API_KEY is empty string', () => {
    const agent = createMockAgent({ OPENPUMP_API_KEY: '' });
    expect(() => OpenPumpPlugin.initialize(agent as never)).toThrow('OPENPUMP_API_KEY');
  });

  it('initialize() uses custom base URL from config', () => {
    const agent = createMockAgent();
    const config = agent['config'] as Record<string, string>;
    config['OPENPUMP_API_BASE_URL'] = 'https://custom.api.example.com';
    OpenPumpPlugin.initialize(agent as never);
    expect(agent['__openpumpClient']).toBeDefined();
  });
});

describe('Action schemas', () => {
  it('buyTokenAction schema validates correct input', () => {
    const result = buyTokenAction.schema.safeParse({
      walletId: 'uuid-123',
      mint: 'So11111111111111111111111111111111',
      amountLamports: '100000000',
    });
    expect(result.success).toBe(true);
  });

  it('buyTokenAction schema rejects invalid amountLamports (float)', () => {
    const result = buyTokenAction.schema.safeParse({
      walletId: 'uuid-123',
      mint: 'So11111111111111111111111111111111',
      amountLamports: '0.5',
    });
    expect(result.success).toBe(false);
  });

  it('buyTokenAction schema rejects missing required fields', () => {
    const result = buyTokenAction.schema.safeParse({
      walletId: 'uuid-123',
    });
    expect(result.success).toBe(false);
  });

  it('buyTokenAction schema accepts optional slippageBps and priorityLevel', () => {
    const result = buyTokenAction.schema.safeParse({
      walletId: 'uuid-123',
      mint: 'So11111111111111111111111111111111',
      amountLamports: '100000000',
      slippageBps: 500,
      priorityLevel: 'fast',
    });
    expect(result.success).toBe(true);
  });

  it('sellTokenAction schema accepts "all" as tokenAmount', () => {
    const result = sellTokenAction.schema.safeParse({
      walletId: 'uuid-123',
      mint: 'TokenMint111111111111111111111111',
      tokenAmount: 'all',
    });
    expect(result.success).toBe(true);
  });

  it('sellTokenAction schema accepts numeric string as tokenAmount', () => {
    const result = sellTokenAction.schema.safeParse({
      walletId: 'uuid-123',
      mint: 'TokenMint111111111111111111111111',
      tokenAmount: '435541983646',
    });
    expect(result.success).toBe(true);
  });

  it('sellTokenAction schema rejects float tokenAmount', () => {
    const result = sellTokenAction.schema.safeParse({
      walletId: 'uuid-123',
      mint: 'TokenMint111111111111111111111111',
      tokenAmount: '1.5',
    });
    expect(result.success).toBe(false);
  });

  it('createTokenAction schema validates required fields', () => {
    const result = createTokenAction.schema.safeParse({
      walletId: 'uuid-123',
      name: 'Test Token',
      symbol: 'TEST',
      description: 'A test token',
      imageUrl: 'https://example.com/img.png',
    });
    expect(result.success).toBe(true);
  });

  it('createTokenAction schema rejects missing name', () => {
    const result = createTokenAction.schema.safeParse({
      walletId: 'uuid-123',
      symbol: 'TEST',
      description: 'A test token',
      imageUrl: 'https://example.com/img.png',
    });
    expect(result.success).toBe(false);
  });

  it('createTokenAction schema accepts optional social fields', () => {
    const result = createTokenAction.schema.safeParse({
      walletId: 'uuid-123',
      name: 'Test Token',
      symbol: 'TEST',
      description: 'A test token',
      imageUrl: 'https://example.com/img.png',
      twitter: '@testtoken',
      website: 'https://testtoken.com',
    });
    expect(result.success).toBe(true);
  });

  it('getTokenInfoAction schema validates mint', () => {
    const result = getTokenInfoAction.schema.safeParse({
      mint: 'SomeTokenMintAddress',
    });
    expect(result.success).toBe(true);
  });

  it('getTokenInfoAction schema rejects empty input', () => {
    const result = getTokenInfoAction.schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('listWalletsAction schema accepts empty input', () => {
    const result = listWalletsAction.schema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('getBalanceAction schema validates walletId', () => {
    const result = getBalanceAction.schema.safeParse({
      walletId: 'wallet-uuid-456',
    });
    expect(result.success).toBe(true);
  });

  it('getBalanceAction schema rejects missing walletId', () => {
    const result = getBalanceAction.schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('createWalletAction schema accepts empty object', () => {
    const valid = createWalletAction.schema.safeParse({});
    expect(valid.success).toBe(true);
  });

  it('createWalletAction schema accepts optional label', () => {
    const withLabel = createWalletAction.schema.safeParse({ label: 'my-wallet' });
    expect(withLabel.success).toBe(true);
  });

  it('bundleBuyAction schema validates full input', () => {
    const result = bundleBuyAction.schema.safeParse({
      devWalletId: 'dev-uuid',
      buyWalletIds: ['w1', 'w2'],
      tokenParams: {
        name: 'Test',
        symbol: 'TST',
        description: 'A test',
        imageUrl: 'https://example.com/img.png',
      },
      devBuyAmountSol: '100000000',
      walletBuyAmounts: ['200000000', '300000000'],
      confirm: true,
    });
    expect(result.success).toBe(true);
  });

  it('bundleBuyAction schema rejects invalid devBuyAmountSol', () => {
    const result = bundleBuyAction.schema.safeParse({
      devWalletId: 'dev-uuid',
      buyWalletIds: ['w1'],
      tokenParams: {
        name: 'Test',
        symbol: 'TST',
        description: 'A test',
        imageUrl: 'https://example.com/img.png',
      },
      devBuyAmountSol: '0.5',
      walletBuyAmounts: ['200000000'],
      confirm: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('Action handler delegation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('buyTokenAction handler calls API with correct path and method', async () => {
    const mockResponse = new Response(
      JSON.stringify({ data: { signature: 'abc123' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const agent = createMockAgent();
    OpenPumpPlugin.initialize(agent as never);

    const result = await buyTokenAction.handler(agent as never, {
      walletId: 'uuid-123',
      mint: 'TokenMint111',
      amountLamports: '100000000',
    });

    expect(result).toHaveProperty('data');
    const fetchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(fetchCalls.length).toBe(1);
    const [url, options] = fetchCalls[0] as [string, RequestInit];
    expect(url).toContain('/api/tokens/TokenMint111/buy');
    expect(options.method).toBe('POST');
    expect(options.headers).toHaveProperty('Authorization', 'Bearer op_sk_test_123');

    vi.unstubAllGlobals();
  });

  it('sellTokenAction handler calls API with correct path', async () => {
    const mockResponse = new Response(
      JSON.stringify({ data: { signature: 'def456' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const agent = createMockAgent();
    OpenPumpPlugin.initialize(agent as never);

    await sellTokenAction.handler(agent as never, {
      walletId: 'uuid-123',
      mint: 'TokenMint222',
      tokenAmount: 'all',
    });

    const fetchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const [url] = fetchCalls[0] as [string];
    expect(url).toContain('/api/tokens/TokenMint222/sell');

    vi.unstubAllGlobals();
  });

  it('getTokenInfoAction handler calls GET on curve-state', async () => {
    const mockResponse = new Response(
      JSON.stringify({ data: { name: 'Token' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const agent = createMockAgent();
    OpenPumpPlugin.initialize(agent as never);

    await getTokenInfoAction.handler(agent as never, {
      mint: 'TokenMint333',
    });

    const fetchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const [url, options] = fetchCalls[0] as [string, RequestInit | undefined];
    expect(url).toContain('/api/tokens/TokenMint333/curve-state');
    // GET requests don't set method explicitly (defaults to GET)
    expect(options?.method).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it('listWalletsAction handler calls GET on /api/wallets', async () => {
    const mockResponse = new Response(
      JSON.stringify({ data: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const agent = createMockAgent();
    OpenPumpPlugin.initialize(agent as never);

    await listWalletsAction.handler(agent as never, {});

    const fetchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const [url] = fetchCalls[0] as [string];
    expect(url).toContain('/api/wallets');

    vi.unstubAllGlobals();
  });

  it('handler throws when API returns error', async () => {
    const mockResponse = new Response(
      JSON.stringify({ message: 'Wallet not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const agent = createMockAgent();
    OpenPumpPlugin.initialize(agent as never);

    await expect(
      getBalanceAction.handler(agent as never, { walletId: 'nonexistent' }),
    ).rejects.toThrow('OpenPump API error (HTTP 404)');

    vi.unstubAllGlobals();
  });

  it('handler throws when plugin not initialized', async () => {
    const agent = createMockAgent();
    // Intentionally NOT calling OpenPumpPlugin.initialize(agent)

    await expect(
      buyTokenAction.handler(agent as never, {
        walletId: 'uuid',
        mint: 'mint',
        amountLamports: '100',
      }),
    ).rejects.toThrow('not initialized');
  });

  it('bundleBuyAction handler throws when confirm is false', async () => {
    const agent = createMockAgent();
    OpenPumpPlugin.initialize(agent as never);

    await expect(
      bundleBuyAction.handler(agent as never, {
        devWalletId: 'dev',
        buyWalletIds: ['w1'],
        tokenParams: { name: 'T', symbol: 'T', description: 'T', imageUrl: 'https://x.com/i.png' },
        devBuyAmountSol: '100',
        walletBuyAmounts: ['200'],
        confirm: false,
      }),
    ).rejects.toThrow('confirm');
  });
});

describe('All actions have required fields', () => {
  const allActions: Action[] = [
    buyTokenAction,
    sellTokenAction,
    createTokenAction,
    getTokenInfoAction,
    listWalletsAction,
    createWalletAction,
    getBalanceAction,
    bundleBuyAction,
  ];

  for (const action of allActions) {
    it(`${action.name} has similes (3+)`, () => {
      expect(action.similes.length).toBeGreaterThanOrEqual(3);
    });

    it(`${action.name} has examples (1+)`, () => {
      expect(action.examples.length).toBeGreaterThanOrEqual(1);
    });

    it(`${action.name} has meaningful description`, () => {
      expect(action.description.length).toBeGreaterThan(20);
    });

    it(`${action.name} has schema`, () => {
      expect(action.schema).toBeDefined();
    });

    it(`${action.name} has handler function`, () => {
      expect(typeof action.handler).toBe('function');
    });

    it(`${action.name} name starts with OPENPUMP_`, () => {
      expect(action.name).toMatch(/^OPENPUMP_/);
    });
  }
});
