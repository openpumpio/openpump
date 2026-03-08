/**
 * Unit tests for the REST-based API key auth middleware.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createApiKeyMiddleware, validateApiKey } from '../middleware/api-key-auth.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('validateApiKey', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns UserContext on valid API key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        userId: 'user-123',
        apiKeyId: 'key-456',
        scopes: ['read', 'trade'],
        wallets: [
          { id: 'w1', publicKey: 'ABC123', label: 'main', index: 0 },
        ],
      }),
    });

    const result = await validateApiKey('op_sk_live_testkey', 'https://api.example.com');

    expect(result).not.toBeNull();
    expect(result!.userId).toBe('user-123');
    expect(result!.apiKeyId).toBe('key-456');
    expect(result!.scopes).toEqual(['read', 'trade']);
    expect(result!.wallets).toHaveLength(1);
    expect(result!.wallets[0]!.publicKey).toBe('ABC123');
    expect(result!.apiKey).toBe('op_sk_live_testkey');

    // Verify fetch was called with correct URL and headers
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/api/auth/validate',
      {
        method: 'GET',
        headers: {
          Authorization: 'Bearer op_sk_live_testkey',
        },
      },
    );
  });

  it('returns null on 401 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const result = await validateApiKey('op_sk_live_badkey', 'https://api.example.com');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    const result = await validateApiKey('op_sk_live_testkey', 'https://unreachable.example.com');
    expect(result).toBeNull();
  });

  it('assigns wallet index from response or fallback to array position', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        userId: 'user-123',
        scopes: [],
        wallets: [
          { id: 'w1', publicKey: 'ABC', label: null },
          { id: 'w2', publicKey: 'DEF', label: 'second', index: 5 },
        ],
      }),
    });

    const result = await validateApiKey('op_sk_live_testkey', 'https://api.example.com');

    expect(result).not.toBeNull();
    // First wallet has no index in response, should fallback to array position (0)
    expect(result!.wallets[0]!.index).toBe(0);
    // Second wallet has explicit index 5
    expect(result!.wallets[1]!.index).toBe(5);
  });
});

describe('createApiKeyMiddleware', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  function createMockReq(headers: Record<string, string> = {}): Partial<Request> {
    return {
      headers: headers as Request['headers'],
    };
  }

  function createMockRes(): Partial<Response> & { statusCode: number; body: unknown } {
    const res: Partial<Response> & { statusCode: number; body: unknown } = {
      statusCode: 200,
      body: null,
      status(code: number) {
        res.statusCode = code;
        return res as Response;
      },
      json(data: unknown) {
        res.body = data;
        return res as Response;
      },
    };
    return res;
  }

  it('rejects requests without API key', async () => {
    const middleware = createApiKeyMiddleware('https://api.example.com');
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req as Request, res as unknown as Response, next as NextFunction);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects API keys that do not start with op_sk_live_', async () => {
    const middleware = createApiKeyMiddleware('https://api.example.com');
    const req = createMockReq({ 'x-api-key': 'sk_test_invalid' });
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req as Request, res as unknown as Response, next as NextFunction);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts valid API key from x-api-key header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        userId: 'user-123',
        apiKeyId: 'key-456',
        scopes: ['read'],
        wallets: [],
      }),
    });

    const middleware = createApiKeyMiddleware('https://api.example.com');
    const req = createMockReq({ 'x-api-key': 'op_sk_live_valid' });
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req as Request, res as unknown as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    expect((req as Request & { userContext?: unknown }).userContext).toBeDefined();
  });

  it('accepts valid API key from Authorization Bearer header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        userId: 'user-123',
        apiKeyId: 'key-456',
        scopes: ['read'],
        wallets: [],
      }),
    });

    const middleware = createApiKeyMiddleware('https://api.example.com');
    const req = createMockReq({ authorization: 'Bearer op_sk_live_valid' });
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req as Request, res as unknown as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
  });

  it('rejects when REST API validation fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const middleware = createApiKeyMiddleware('https://api.example.com');
    const req = createMockReq({ 'x-api-key': 'op_sk_live_expired' });
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req as Request, res as unknown as Response, next as NextFunction);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
