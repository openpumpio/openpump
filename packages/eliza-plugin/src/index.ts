/**
 * @openpump/eliza-plugin — ElizaOS plugin for OpenPump token trading.
 *
 * Provides 25 trading, wallet management, market making, sniping, stop-loss,
 * and vanity address actions plus a portfolio context provider
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

// Trading actions
export { buyTokenAction } from './actions/buy-token.js';
export { sellTokenAction } from './actions/sell-token.js';
export { createTokenAction } from './actions/create-token.js';
export { getTokenInfoAction } from './actions/get-token-info.js';
export { bundleBuyAction } from './actions/bundle-buy.js';
export { sellAllAction } from './actions/sell-all.js';

// Wallet actions
export { listWalletsAction } from './actions/list-wallets.js';
export { getBalanceAction } from './actions/get-balance.js';
export { getAggregateBalanceAction } from './actions/get-aggregate-balance.js';
export { batchCreateWalletsAction } from './actions/batch-create-wallets.js';
export { transferSolAction } from './actions/transfer-sol.js';
export { transferTokenAction } from './actions/transfer-token.js';

// Market making actions
export { mmStartSessionAction } from './actions/mm-start-session.js';
export { mmStopSessionAction } from './actions/mm-stop-session.js';
export { mmSessionStatusAction } from './actions/mm-session-status.js';
export { mmListSessionsAction } from './actions/mm-list-sessions.js';

// Snipe actions
export { snipeStartAction } from './actions/snipe-start.js';
export { snipeStopAction } from './actions/snipe-stop.js';
export { snipeListAction } from './actions/snipe-list.js';

// Stop-loss actions
export { stopLossSetAction } from './actions/stop-loss-set.js';
export { stopLossRemoveAction } from './actions/stop-loss-remove.js';
export { stopLossListAction } from './actions/stop-loss-list.js';

// Vanity address actions
export { vanityOrderAction } from './actions/vanity-order.js';
export { vanityListAction } from './actions/vanity-list.js';

// Utilities
export { getClient, clearClientCache } from './plugin.js';
export { createApiClient, type ApiClient } from './lib/api-client.js';
