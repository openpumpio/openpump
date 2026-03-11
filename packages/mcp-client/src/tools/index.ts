/**
 * Barrel file that registers all 56 MCP tools onto a server instance.
 *
 * Tool groups:
 * - token-tools:    create-token
 * - trading-tools:  bundle-launch, bundle-buy, bundle-sell, buy-token, sell-token, estimate-bundle-cost, claim-creator-fees
 * - transfer-tools: transfer-sol, transfer-token
 * - wallet-tools:   create-wallet, get-aggregate-balance, get-wallet-deposit-address, get-wallet-transactions
 * - info-tools:     get-token-info, get-token-market-info, list-my-tokens, get-token-holdings,
 *                   get-wallet-balance, list-wallets, get-creator-fees,
 *                   get-token-quote, get-jito-tip-levels
 * - job-tools:      poll-job, cancel-job
 * - vanity-tools:   estimate-vanity-cost, order-vanity-address, list-vanity-jobs, get-vanity-job
 * - mm-tools:       mm-create-pool, mm-fund-pool, mm-pool-status, mm-consolidate-pool, mm-list-pools,
 *                   mm-start-session, mm-stop-session, mm-pause-session, mm-resume-session,
 *                   mm-session-status, mm-list-sessions, mm-update-strategy, mm-get-pnl
 * - snipe-tools:    snipe-start, snipe-stop, snipe-pause, snipe-resume, snipe-update,
 *                   snipe-status, snipe-list, stop-loss-set, stop-loss-remove,
 *                   stop-loss-list, stop-loss-status
 * - spam-tools:     spam-launch, estimate-spam-cost, cancel-spam-launch
 *
 * Total: 56 tools.
 *
 * Unlike apps/mcp, this publishable version passes apiBaseUrl explicitly
 * to each tool registration function (no hardcoded API_BASE_URL constant).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UserContext } from '../lib/context.js';
import { registerTokenTools } from './token-tools.js';
import { registerTradingTools } from './trading-tools.js';
import { registerTransferTools } from './transfer-tools.js';
import { registerWalletTools } from './wallet-tools.js';
import { registerInfoTools } from './info-tools.js';
import { registerJobTools } from './job-tools.js';
import { registerVanityTools } from './vanity-tools.js';
import { registerMmTools } from './mm-tools.js';
import { registerSnipeTools } from './snipe-tools.js';
import { registerSpamTools } from './spam-tools.js';

/**
 * Register all 56 OpenPump tools onto the given McpServer.
 *
 * @param server      - MCP server instance to register tools on
 * @param userContext  - Authenticated user context (identity, wallets, scopes)
 * @param apiBaseUrl  - Base URL of the OpenPump REST API (e.g. "https://openpump.io")
 */
export function registerAllTools(server: McpServer, userContext: UserContext, apiBaseUrl: string): void {
  registerTokenTools(server, userContext, apiBaseUrl);
  registerTradingTools(server, userContext, apiBaseUrl);
  registerTransferTools(server, userContext, apiBaseUrl);
  registerWalletTools(server, userContext, apiBaseUrl);
  registerInfoTools(server, userContext, apiBaseUrl);
  registerJobTools(server, userContext, apiBaseUrl);
  registerVanityTools(server, userContext, apiBaseUrl);
  registerMmTools(server, userContext, apiBaseUrl);
  registerSnipeTools(server, userContext, apiBaseUrl);
  registerSpamTools(server, userContext, apiBaseUrl);
}
