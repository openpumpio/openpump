/**
 * @openpump/eliza-plugin — ElizaOS plugin for OpenPump token trading.
 *
 * Provides 8 trading/wallet actions and a portfolio context provider
 * for ElizaOS conversational AI agents.
 *
 * @example
 * ```json
 * {
 *   "plugins": ["@openpump/eliza-plugin"],
 *   "settings": { "secrets": { "OPENPUMP_API_KEY": "op_sk_live_..." } }
 * }
 * ```
 */
export { openpumpPlugin } from './plugin.js';
export { openpumpPlugin as default } from './plugin.js';

// Re-export individual components for advanced usage
export { walletProvider } from './providers/wallet-provider.js';
export { buyTokenAction } from './actions/buy-token.js';
export { sellTokenAction } from './actions/sell-token.js';
export { createTokenAction } from './actions/create-token.js';
export { getTokenInfoAction } from './actions/get-token-info.js';
export { listWalletsAction } from './actions/list-wallets.js';
export { getBalanceAction } from './actions/get-balance.js';
export { bundleBuyAction } from './actions/bundle-buy.js';
export { sellAllAction } from './actions/sell-all.js';

// Utilities
export { getClient, clearClientCache } from './plugin.js';
export { createApiClient, type ApiClient } from './lib/api-client.js';
