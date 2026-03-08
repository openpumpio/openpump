/**
 * Express middleware for MCP API key authentication.
 *
 * Unlike the apps/mcp version (which uses @openpump/db), this middleware
 * validates API keys by calling the REST API's /api/auth/validate endpoint.
 * This allows the package to be published to npm without database dependencies.
 */
import type { Request, Response, NextFunction } from 'express';
import type { UserContext } from '../lib/context.js';

const UNAUTHORIZED_RESPONSE = {
  jsonrpc: '2.0',
  error: { code: -32_001, message: 'Unauthorized: Invalid API key' },
  id: null,
};

function extractRawKey(req: Request): string | undefined {
  const xApiKey = req.headers['x-api-key'];
  if (typeof xApiKey === 'string') return xApiKey;
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return undefined;
}

/**
 * Validate an API key by calling the OpenPump REST API.
 *
 * GET /api/auth/validate
 * Authorization: Bearer <apiKey>
 *
 * Returns UserContext on success, null on failure.
 */
async function validateViaRestApi(
  apiKey: string,
  apiBaseUrl: string,
): Promise<UserContext | null> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/auth/validate`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      userId: string;
      apiKeyId?: string;
      scopes: string[];
      wallets: Array<{
        id: string;
        publicKey: string;
        label: string | null;
        index?: number;
      }>;
    };

    return {
      userId: data.userId,
      apiKeyId: data.apiKeyId ?? '',
      scopes: data.scopes,
      wallets: data.wallets.map((w, i) => ({
        id: w.id,
        publicKey: w.publicKey,
        label: w.label,
        index: w.index ?? i,
      })),
      apiKey,
    };
  } catch {
    return null;
  }
}

/**
 * Create Express middleware that authenticates MCP requests using OpenPump API keys.
 *
 * @param apiBaseUrl - Base URL of the OpenPump API (e.g. "https://openpump.io")
 */
export function createApiKeyMiddleware(apiBaseUrl: string) {
  return async function apiKeyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const rawKey = extractRawKey(req);

    if (!rawKey?.startsWith('op_sk_live_')) {
      res.status(401).json(UNAUTHORIZED_RESPONSE);
      return;
    }

    const userContext = await validateViaRestApi(rawKey, apiBaseUrl);

    if (!userContext) {
      res.status(401).json(UNAUTHORIZED_RESPONSE);
      return;
    }

    (req as Request & { userContext: UserContext }).userContext = userContext;
    next();
  };
}

/**
 * Standalone validation function for stdio entry point.
 * Validates once at startup and returns the UserContext.
 */
export async function validateApiKey(
  apiKey: string,
  apiBaseUrl: string,
): Promise<UserContext | null> {
  return validateViaRestApi(apiKey, apiBaseUrl);
}
