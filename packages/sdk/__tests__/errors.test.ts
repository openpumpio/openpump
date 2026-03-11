import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenPump } from '../src/index.js';
import {
  OpenPumpError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  NotFoundError,
} from '../src/errors.js';

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

describe('Error handling', () => {
  let op: OpenPump;

  beforeEach(() => {
    op = new OpenPump({ apiKey: 'op_sk_test_123', baseUrl: 'http://localhost:3001' });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('401 response throws AuthenticationError', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ error: 'UNAUTHORIZED', message: 'Invalid API key' }, 401),
    );

    try {
      await op.wallets.list();
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error).toBeInstanceOf(OpenPumpError);
      const authError = error as AuthenticationError;
      expect(authError.code).toBe('UNAUTHORIZED');
      expect(authError.message).toBe('Invalid API key');
      expect(authError.status).toBe(401);
      expect(authError.name).toBe('AuthenticationError');
    }
  });

  it('404 response throws NotFoundError', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ error: 'NOT_FOUND', message: 'Resource not found' }, 404),
    );

    try {
      await op.wallets.get('nonexistent');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error).toBeInstanceOf(OpenPumpError);
      const notFound = error as NotFoundError;
      expect(notFound.code).toBe('NOT_FOUND');
      expect(notFound.status).toBe(404);
      expect(notFound.name).toBe('NotFoundError');
    }
  });

  it('422 response throws ValidationError', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: { field: 'name', issue: 'required' },
        },
        422,
      ),
    );

    try {
      await op.tokens.create({
        name: '',
        symbol: '',
        description: '',
        imageBase64: '',
        imageType: 'image/png',
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(OpenPumpError);
      const validationError = error as ValidationError;
      expect(validationError.code).toBe('VALIDATION_ERROR');
      expect(validationError.status).toBe(422);
      expect(validationError.details).toEqual({ field: 'name', issue: 'required' });
      expect(validationError.name).toBe('ValidationError');
    }
  });

  it('429 response throws RateLimitError', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ error: 'RATE_LIMITED', message: 'Too many requests' }, 429),
    );

    try {
      await op.wallets.list();
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error).toBeInstanceOf(OpenPumpError);
      const rateError = error as RateLimitError;
      expect(rateError.code).toBe('RATE_LIMITED');
      expect(rateError.status).toBe(429);
      expect(rateError.name).toBe('RateLimitError');
    }
  });

  it('500 response throws generic OpenPumpError', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ error: 'INTERNAL_ERROR', message: 'Server error' }, 500),
    );

    try {
      await op.wallets.list();
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(OpenPumpError);
      expect(error).not.toBeInstanceOf(AuthenticationError);
      expect(error).not.toBeInstanceOf(NotFoundError);
      const openPumpError = error as OpenPumpError;
      expect(openPumpError.code).toBe('INTERNAL_ERROR');
      expect(openPumpError.status).toBe(500);
      expect(openPumpError.name).toBe('OpenPumpError');
    }
  });

  it('non-JSON error body uses status text fallback', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: () => Promise.reject(new Error('not JSON')),
      headers: new Headers(),
    } as Response);

    try {
      await op.wallets.list();
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(OpenPumpError);
      const openPumpError = error as OpenPumpError;
      expect(openPumpError.code).toBe('UNKNOWN_ERROR');
      expect(openPumpError.message).toBe('Service Unavailable');
      expect(openPumpError.status).toBe(503);
    }
  });

  it('error uses code field when present', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ code: 'SPECIFIC_CODE', message: 'Specific message' }, 400),
    );

    try {
      await op.wallets.list();
      expect.fail('Should have thrown');
    } catch (error) {
      const openPumpError = error as OpenPumpError;
      expect(openPumpError.code).toBe('SPECIFIC_CODE');
    }
  });

  it('constructor throws when apiKey is empty', () => {
    expect(() => new OpenPump({ apiKey: '' })).toThrow('apiKey is required');
  });
});
