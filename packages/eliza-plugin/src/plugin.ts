/**
 * OpenPump ElizaOS plugin — main plugin definition.
 *
 * Exports a valid ElizaOS Plugin object with:
 * - init() that validates the API key and pre-creates the client
 * - 8 actions for trading, token management, and wallet queries
 * - 1 provider for portfolio context injection
 */
import type { Plugin, IAgentRuntime } from '@elizaos/core';
import { buyTokenAction } from './actions/buy-token.js';
import { sellTokenAction } from './actions/sell-token.js';
import { createTokenAction } from './actions/create-token.js';
import { getTokenInfoAction } from './actions/get-token-info.js';
import { listWalletsAction } from './actions/list-wallets.js';
import { getBalanceAction } from './actions/get-balance.js';
import { bundleBuyAction } from './actions/bundle-buy.js';
import { sellAllAction } from './actions/sell-all.js';
import { walletProvider } from './providers/wallet-provider.js';
import { createApiClient, type ApiClient } from './lib/api-client.js';

/** Module-level client cache keyed by agent ID to avoid re-creating per call. */
const clientCache = new Map<string, ApiClient>();

/**
 * Retrieve or create an ApiClient for the given runtime.
 * Called by action handlers and providers to get the authenticated client.
 */
export function getClient(runtime: IAgentRuntime): ApiClient {
  const agentId = runtime.agentId;
  const cached = clientCache.get(agentId);
  if (cached) {
    return cached;
  }
  const apiKey = runtime.getSetting('OPENPUMP_API_KEY');
  const baseUrl = runtime.getSetting('OPENPUMP_API_URL');
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('OPENPUMP_API_KEY not configured in character settings');
  }
  const client = createApiClient(apiKey, typeof baseUrl === 'string' ? baseUrl : 'https://api.openpump.io');
  clientCache.set(agentId, client);
  return client;
}

/**
 * Clear a cached client (useful for testing).
 */
export function clearClientCache(agentId?: string): void {
  if (agentId) {
    clientCache.delete(agentId);
  } else {
    clientCache.clear();
  }
}

export const openpumpPlugin: Plugin = {
  name: 'openpump',
  description:
    'Buy, sell, and launch PumpFun tokens via the OpenPump managed wallet API. ' +
    'Provides trading actions and portfolio context for conversational AI agents.',

  init: (_config: Record<string, string>, runtime: IAgentRuntime): Promise<void> => {
    const apiKey = runtime.getSetting('OPENPUMP_API_KEY');
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error(
        'OpenPump plugin requires OPENPUMP_API_KEY in character settings. ' +
        'Add it to settings.secrets.OPENPUMP_API_KEY in your character JSON.',
      );
    }
    // Pre-create client to validate configuration at startup
    const rawBaseUrl = runtime.getSetting('OPENPUMP_API_URL');
    const baseUrl = typeof rawBaseUrl === 'string' ? rawBaseUrl : 'https://api.openpump.io';
    const client = createApiClient(apiKey, baseUrl);
    clientCache.set(runtime.agentId, client);
    return Promise.resolve();
  },

  actions: [
    buyTokenAction,
    sellTokenAction,
    createTokenAction,
    getTokenInfoAction,
    listWalletsAction,
    getBalanceAction,
    bundleBuyAction,
    sellAllAction,
  ],

  providers: [walletProvider],
};
