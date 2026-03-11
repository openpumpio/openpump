/**
 * Market making tools for the OpenPump MCP server (publishable package).
 *
 * Pool management tools (5):
 * - mm-create-pool:       Create N wallets grouped as a labeled pool
 * - mm-fund-pool:         Distribute SOL to pool wallets via hop-funded transfers (confirm gate)
 * - mm-pool-status:       Aggregate pool view with per-wallet SOL + token balances
 * - mm-consolidate-pool:  Sweep all funds from pool wallets to a target wallet (confirm gate)
 * - mm-list-pools:        List all pools for the authenticated user
 *
 * Session lifecycle tools (8):
 * - mm-start-session:     Create and start a new MM session (confirm gate, auto API key)
 * - mm-stop-session:      Stop a running or paused session permanently
 * - mm-pause-session:     Pause an active session
 * - mm-resume-session:    Resume a paused session
 * - mm-session-status:    Get detailed session status with human-readable stats
 * - mm-list-sessions:     List user's sessions with optional status filter
 * - mm-update-strategy:   Hot-update strategy parameters on a running/paused session
 * - mm-get-pnl:           Get session P&L report
 *
 * Total: 13 tools.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { UserContext } from '../lib/context.js';
import { createApiClient } from '../lib/api-client.js';

const DISCLAIMER = 'Not available to US persons. Use at own risk.';
const LAMPORTS_PER_SOL = 1_000_000_000;

/** Convert a lamports string to a human-readable SOL string. */
function toSol(lamports: string | undefined): string {
  return lamports ? (Number(lamports) / LAMPORTS_PER_SOL).toFixed(6) : '0';
}

// ---------------------------------------------------------------------------
// Zod Schemas for MMSessionConfig
// ---------------------------------------------------------------------------

/**
 * Full config schema used by mm-start-session.
 * Fields with defaults are optional; maxPositionSol and amountRange are required.
 */
const MMSessionConfigSchema = z.object({
  netBias: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .describe('Buy/sell bias: 0.0 = all sells, 0.5 = balanced, 1.0 = all buys'),
  amountRange: z
    .tuple([
      z.string().regex(/^\d+$/, 'Must be lamports string'),
      z.string().regex(/^\d+$/, 'Must be lamports string'),
    ])
    .describe(
      'Trade amount range [minLamports, maxLamports] (e.g. ["5000000", "50000000"] = 0.005-0.05 SOL)',
    ),
  intervalRange: z
    .tuple([z.number().int().min(3), z.number().int().max(300)])
    .default([10, 45])
    .describe('Trade interval range [minSeconds, maxSeconds] (default [10, 45])'),
  supportLevels: z
    .array(z.string())
    .default([])
    .describe('SOL price levels where bot increases buy bias (optional)'),
  takeProfitLevels: z
    .array(
      z.object({
        price: z.string().describe('SOL price to trigger take-profit'),
        sellPercent: z
          .number()
          .min(1)
          .max(100)
          .describe('Percentage of position to sell (1-100)'),
      }),
    )
    .default([])
    .describe('Take-profit levels with sell percentages (optional)'),
  maxPositionSol: z
    .string()
    .regex(/^\d+$/, 'Must be lamports string')
    .describe(
      'Maximum total SOL deployed per session in lamports (REQUIRED, e.g. "1000000000" = 1 SOL)',
    ),
  maxDrawdownPercent: z
    .number()
    .min(5)
    .max(50)
    .default(15)
    .describe('Circuit breaker: halt session if drawdown exceeds this % (default 15)'),
  volumeMode: z
    .boolean()
    .default(false)
    .describe('If true, maintain balanced buy/sell ratio for volume generation'),
  maxDurationMinutes: z
    .number()
    .int()
    .min(0)
    .max(10_080)
    .default(1440)
    .describe('Hard session timeout in minutes. 0 = indefinite. Default 1440 (24h)'),
  slippageBps: z
    .number()
    .int()
    .min(100)
    .max(5000)
    .default(500)
    .describe('Slippage tolerance in basis points (default 500 = 5%)'),
  priorityLevel: z
    .enum(['economy', 'normal', 'fast', 'turbo'])
    .default('normal')
    .describe('Jito priority tier for trade execution'),
});

/**
 * Partial config schema used by mm-update-strategy.
 * All fields are optional so users can update individual parameters.
 */
const MMSessionConfigPartialSchema = z.object({
  netBias: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Buy/sell bias: 0.0 = all sells, 0.5 = balanced, 1.0 = all buys'),
  amountRange: z
    .tuple([
      z.string().regex(/^\d+$/, 'Must be lamports string'),
      z.string().regex(/^\d+$/, 'Must be lamports string'),
    ])
    .optional()
    .describe('Trade amount range [minLamports, maxLamports]'),
  intervalRange: z
    .tuple([z.number().int().min(3), z.number().int().max(300)])
    .optional()
    .describe('Trade interval range [minSeconds, maxSeconds]'),
  supportLevels: z.array(z.string()).optional().describe('SOL price support levels'),
  takeProfitLevels: z
    .array(
      z.object({
        price: z.string(),
        sellPercent: z.number().min(1).max(100),
      }),
    )
    .optional()
    .describe('Take-profit levels'),
  maxPositionSol: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .describe('Max SOL deployed (lamports)'),
  maxDrawdownPercent: z
    .number()
    .min(5)
    .max(50)
    .optional()
    .describe('Drawdown circuit breaker %'),
  volumeMode: z.boolean().optional().describe('Volume generation mode'),
  maxDurationMinutes: z
    .number()
    .int()
    .min(0)
    .max(10_080)
    .optional()
    .describe('Session timeout in minutes'),
  slippageBps: z
    .number()
    .int()
    .min(100)
    .max(5000)
    .optional()
    .describe('Slippage tolerance in bps'),
  priorityLevel: z
    .enum(['economy', 'normal', 'fast', 'turbo'])
    .optional()
    .describe('Jito priority tier'),
});

/** Base path for pool management endpoints within the market-making API group. */
const POOLS_BASE = '/api/market-making/pools';

/** Base path for session lifecycle endpoints within the market-making API group. */
const SESSIONS_BASE = '/api/market-making/sessions';

function agentError(code: string, message: string, suggestion?: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: true, code, message, suggestion }),
      },
    ],
  };
}

/**
 * Parse an API error response body into a structured error.
 */
async function parseApiError(res: Response): Promise<{ code: string; message: string }> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { code?: string; message?: string; error?: string };
    return {
      code: parsed.code ?? parsed.error ?? 'POOL_ERROR',
      message: parsed.message ?? text,
    };
  } catch {
    return { code: 'POOL_ERROR', message: text };
  }
}

const WRITE_ANNOTATIONS = {
  destructiveHint: true,
  idempotentHint: false,
  readOnlyHint: false,
  openWorldHint: true,
} as const;

const READ_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: true,
  readOnlyHint: true,
  openWorldHint: false,
} as const;

/**
 * Register all 13 market making tools onto the given McpServer.
 * Includes 5 pool management tools and 8 session lifecycle tools.
 */
export function registerMmTools(server: McpServer, userContext: UserContext, apiBaseUrl: string): void {
  // ── mm-create-pool ────────────────────────────────────────────────────────

  server.tool(
    'mm-create-pool',
    [
      'Create a new wallet pool with N wallets grouped under a label.',
      'Wallets are HD-derived from the account master seed.',
      'Use mm-fund-pool to distribute SOL to the pool after creation.',
      'Returns the pool ID, label, wallet count, and list of wallet IDs.',
      DISCLAIMER,
    ].join(' '),
    {
      label: z
        .string()
        .min(1)
        .max(64)
        .describe(
          'Human-readable label for the pool (e.g. "volume-bot-1", "mm-pool-sol"). ' +
            'Alphanumeric, hyphens, and underscores only.',
        ),
      walletCount: z
        .number()
        .int()
        .min(2)
        .max(50)
        .describe('Number of wallets to create in the pool (2-50).'),
    },
    WRITE_ANNOTATIONS,
    async ({ label, walletCount }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.post(POOLS_BASE, { label, walletCount });

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(
            code,
            `Failed to create pool (HTTP ${res.status.toString()}): ${message}`,
            code === 'DUPLICATE_POOL_LABEL'
              ? 'Choose a different label — this one is already in use.'
              : 'Verify your account has sufficient credits and wallet capacity.',
          );
        }

        const data: unknown = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Create pool request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // ── mm-fund-pool ──────────────────────────────────────────────────────────

  server.tool(
    'mm-fund-pool',
    [
      'Distribute SOL from a source wallet to all wallets in a pool.',
      'SOL is divided roughly equally across pool wallets.',
      'Use hops > 0 for multi-hop transfer chains that break on-chain wallet clustering.',
      'hops=0 sends directly, hops=2 routes through ephemeral intermediary wallets (recommended).',
      'Requires confirm: true to execute.',
      DISCLAIMER,
    ].join(' '),
    {
      poolId: z
        .string()
        .describe('ID of the pool to fund (from mm-create-pool or mm-list-pools).'),
      totalAmountSol: z
        .number()
        .positive()
        .describe(
          'Total SOL to distribute across all pool wallets (in SOL, e.g. 2.5). ' +
            'Each wallet receives approximately totalAmountSol / walletCount.',
        ),
      sourceWalletId: z
        .string()
        .describe(
          'ID of the wallet to fund from (must have sufficient SOL balance). ' +
            'Use list-wallets to find IDs.',
        ),
      hops: z
        .number()
        .int()
        .min(0)
        .max(3)
        .optional()
        .default(0)
        .describe(
          'Number of hop levels for transfer obfuscation (0=direct, 2=recommended for privacy). ' +
            'Higher values add intermediary wallets and random delays to break on-chain clustering.',
        ),
      confirm: z
        .boolean()
        .describe('REQUIRED: Must be true to execute. Review pool status and source balance first.'),
    },
    WRITE_ANNOTATIONS,
    async ({ poolId, totalAmountSol, sourceWalletId, hops, confirm }) => {
      // Validate source wallet exists in session context
      const sourceWallet = userContext.wallets.find((w) => w.id === sourceWalletId);
      if (!sourceWallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Source wallet "${sourceWalletId}" not found for this account.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      // Confirm gate
      if (!confirm) {
        return agentError(
          'CONFIRMATION_REQUIRED',
          'mm-fund-pool requires confirm: true to execute.',
          `This will distribute ${totalAmountSol.toString()} SOL from wallet ${sourceWalletId} to all wallets in pool ${poolId}` +
            (hops !== undefined && hops > 0
              ? ` using ${hops.toString()}-hop transfer chains.`
              : ' via direct transfers.') +
            ' Call again with confirm: true to proceed.',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        // Convert SOL float to lamports decimal string (API expects totalAmountLamports)
        const totalAmountLamports = Math.round(totalAmountSol * LAMPORTS_PER_SOL).toString();
        const body: Record<string, unknown> = {
          totalAmountLamports,
          sourceWalletId,
        };
        // API validates hops >= 1; omit when 0 (direct transfer)
        if (hops !== undefined && hops > 0) body['hops'] = hops;

        const res = await api.post(`${POOLS_BASE}/${poolId}/fund`, body);

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(
            code,
            `Failed to fund pool (HTTP ${res.status.toString()}): ${message}`,
            code === 'INSUFFICIENT_BALANCE'
              ? 'Use get-wallet-balance to check your source wallet SOL balance.'
              : 'Verify the pool ID is correct and the source wallet has sufficient SOL.',
          );
        }

        const data: unknown = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Fund pool request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // ── mm-pool-status ────────────────────────────────────────────────────────

  server.tool(
    'mm-pool-status',
    [
      'Get an aggregate status view of a wallet pool.',
      'Returns pool metadata, per-wallet SOL and token balances,',
      'and aggregated totals (total SOL, total tokens by mint, wallet count).',
      'Use this to check pool health before starting a market making session.',
      'Note: fetches live on-chain balances for each wallet — may take a few seconds for large pools.',
      DISCLAIMER,
    ].join(' '),
    {
      poolId: z
        .string()
        .describe('ID of the pool to inspect (from mm-create-pool or mm-list-pools).'),
    },
    READ_ANNOTATIONS,
    async ({ poolId }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);

        // Step 1: Fetch pool metadata and wallet list
        const poolRes = await api.get(`${POOLS_BASE}/${poolId}`);

        if (!poolRes.ok) {
          const { code, message } = await parseApiError(poolRes);
          return agentError(
            code,
            `Failed to fetch pool details (HTTP ${poolRes.status.toString()}): ${message}`,
            code === 'NOT_FOUND'
              ? 'Use mm-list-pools to see available pool IDs.'
              : 'Try again in a few seconds.',
          );
        }

        const poolData = (await poolRes.json()) as {
          data: {
            id: string;
            label: string;
            walletCount: number;
            createdAt: string;
            walletIds: string[];
            wallets: Array<{
              walletId: string;
              publicKey: string;
              walletIndex: number;
              label: string | null;
            }>;
          };
        };

        const pool = poolData.data;

        // Step 2: Fetch live balances for each wallet in parallel
        const balancePromises = pool.wallets.map(async (w) => {
          try {
            const balRes = await api.get(`/api/wallets/${w.walletId}/balance`);
            if (!balRes.ok) {
              return {
                walletId: w.walletId,
                publicKey: w.publicKey,
                label: w.label,
                solBalance: null as number | null,
                tokenBalances: [] as Array<{ mint: string; amount: string; decimals: number }>,
                error: `HTTP ${balRes.status.toString()}`,
              };
            }
            const balData = (await balRes.json()) as {
              data: {
                solBalance: number;
                tokenBalances: Array<{ mint: string; amount: string; decimals: number }>;
              };
            };
            return {
              walletId: w.walletId,
              publicKey: w.publicKey,
              label: w.label,
              solBalance: balData.data.solBalance,
              tokenBalances: balData.data.tokenBalances,
              error: null,
            };
          } catch {
            return {
              walletId: w.walletId,
              publicKey: w.publicKey,
              label: w.label,
              solBalance: null as number | null,
              tokenBalances: [] as Array<{ mint: string; amount: string; decimals: number }>,
              error: 'Balance fetch failed',
            };
          }
        });

        const walletBalances = await Promise.all(balancePromises);

        // Step 3: Aggregate totals
        let totalSol = 0;
        const tokenTotals: Record<string, { amount: bigint; decimals: number }> = {};

        for (const wb of walletBalances) {
          if (wb.solBalance !== null) {
            totalSol += wb.solBalance;
          }
          for (const tb of wb.tokenBalances) {
            const existing = tokenTotals[tb.mint];
            if (existing) {
              existing.amount += BigInt(tb.amount);
            } else {
              tokenTotals[tb.mint] = { amount: BigInt(tb.amount), decimals: tb.decimals };
            }
          }
        }

        // Convert BigInt to string for JSON serialization
        const aggregatedTokens = Object.entries(tokenTotals).map(([mint, info]) => ({
          mint,
          totalAmount: info.amount.toString(),
          decimals: info.decimals,
        }));

        const result = {
          pool: {
            id: pool.id,
            label: pool.label,
            walletCount: pool.walletCount,
            createdAt: pool.createdAt,
          },
          wallets: walletBalances,
          summary: {
            totalSol,
            totalSolLamports: Math.round(totalSol * LAMPORTS_PER_SOL).toString(),
            tokens: aggregatedTokens,
            walletsWithErrors: walletBalances.filter((w) => w.error !== null).length,
          },
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Pool status request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // ── mm-consolidate-pool ───────────────────────────────────────────────────

  server.tool(
    'mm-consolidate-pool',
    [
      'Sweep all funds from every wallet in a pool to a single target wallet.',
      'By default sweeps SOL only. Pass a mint address to also consolidate a specific SPL token.',
      'Each pool wallet transfers its entire balance minus rent-exempt minimum to the target.',
      'Use this after ending a market making session to recover funds.',
      'Requires confirm: true to execute.',
      DISCLAIMER,
    ].join(' '),
    {
      poolId: z
        .string()
        .describe('ID of the pool to consolidate (from mm-create-pool or mm-list-pools).'),
      targetWalletId: z
        .string()
        .describe(
          'ID of the wallet to receive all consolidated funds. Use list-wallets to find IDs.',
        ),
      mint: z
        .string()
        .optional()
        .describe(
          'Optional SPL token mint address (base58) to also consolidate. ' +
            'If omitted, only SOL is swept. If provided, both SOL and the specified token are swept.',
        ),
      confirm: z
        .boolean()
        .describe(
          'REQUIRED: Must be true to execute. Use mm-pool-status first to review balances.',
        ),
    },
    WRITE_ANNOTATIONS,
    async ({ poolId, targetWalletId, mint, confirm }) => {
      // Validate target wallet exists in session context
      const targetWallet = userContext.wallets.find((w) => w.id === targetWalletId);
      if (!targetWallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Target wallet "${targetWalletId}" not found for this account.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      // Confirm gate
      if (!confirm) {
        return agentError(
          'CONFIRMATION_REQUIRED',
          'mm-consolidate-pool requires confirm: true to execute.',
          `This will sweep all ${mint ? 'SOL and token ' + mint : 'SOL'} from pool ${poolId} ` +
            `to wallet ${targetWalletId}. ` +
            'Use mm-pool-status to review balances first, then call again with confirm: true.',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const body: Record<string, unknown> = { targetWalletId };
        if (mint !== undefined) body['mint'] = mint;

        const res = await api.post(`${POOLS_BASE}/${poolId}/consolidate`, body);

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(
            code,
            `Failed to consolidate pool (HTTP ${res.status.toString()}): ${message}`,
            code === 'POOL_NOT_FOUND'
              ? 'Use mm-list-pools to see available pool IDs.'
              : 'Verify the pool ID and target wallet ID are correct.',
          );
        }

        const data: unknown = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Consolidate pool request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // ── mm-list-pools ─────────────────────────────────────────────────────────

  server.tool(
    'mm-list-pools',
    [
      'List all wallet pools for the authenticated user.',
      'Returns pool ID, label, wallet count, and creation date for each pool.',
      'Use the returned pool ID with mm-pool-status, mm-fund-pool, or mm-consolidate-pool.',
      DISCLAIMER,
    ].join(' '),
    {}, // No parameters — lists all pools for the authenticated user
    READ_ANNOTATIONS,
    async () => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get(POOLS_BASE);

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(
            code,
            `Failed to list pools (HTTP ${res.status.toString()}): ${message}`,
            'Try again in a few seconds.',
          );
        }

        const data: unknown = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `List pools request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // =========================================================================
  // Session Lifecycle Tools (8)
  // =========================================================================

  // ── mm-start-session ────────────────────────────────────────────────────

  server.tool(
    'mm-start-session',
    [
      'Start a new market making session on a PumpFun token.',
      'The bot will autonomously buy and sell the token across the specified wallets using the configured strategy.',
      'Requires confirm: true to execute -- this will start spending SOL automatically.',
      'The session uses your API key automatically for authenticated trading.',
      'Use mm-session-status to monitor progress and mm-stop-session to halt.',
      DISCLAIMER,
    ].join(' '),
    {
      mint: z.string().describe('Token mint address (base58) to market-make'),
      walletPoolId: z
        .string()
        .optional()
        .describe(
          'Wallet pool ID (from mm-list-pools). Mutually exclusive with walletIds.',
        ),
      walletIds: z
        .array(z.string())
        .optional()
        .describe(
          'Explicit wallet IDs to use (from list-wallets). Mutually exclusive with walletPoolId.',
        ),
      config: MMSessionConfigSchema,
      confirm: z
        .boolean()
        .describe(
          'REQUIRED: Must be true to start the session. Review config carefully first.',
        ),
    },
    WRITE_ANNOTATIONS,
    async ({ mint, walletPoolId, walletIds, config, confirm }) => {
      if (!confirm) {
        return agentError(
          'CONFIRMATION_REQUIRED',
          'mm-start-session requires explicit confirmation (confirm: true) before execution.',
          'Review the config parameters carefully. The bot will start spending SOL automatically once started.',
        );
      }

      // Validate mutual exclusivity of walletPoolId and walletIds
      if (walletPoolId !== undefined && walletIds !== undefined) {
        return agentError(
          'INVALID_INPUT',
          'walletPoolId and walletIds are mutually exclusive. Provide one or the other.',
          'Use walletPoolId to reference a pre-created pool, or walletIds for ad-hoc wallet selection.',
        );
      }
      if (walletPoolId === undefined && walletIds === undefined) {
        return agentError(
          'MISSING_PARAM',
          'Either walletPoolId or walletIds is required.',
          'Use mm-list-pools to find a pool ID, or list-wallets to pick individual wallet IDs.',
        );
      }

      // Validate walletIds belong to user (if provided directly)
      if (walletIds !== undefined) {
        const missingWallets = walletIds.filter(
          (id) => !userContext.wallets.some((w) => w.id === id),
        );
        if (missingWallets.length > 0) {
          return agentError(
            'WALLET_NOT_FOUND',
            `Wallets not found: ${missingWallets.join(', ')}.`,
            'Use list-wallets to see available wallet IDs.',
          );
        }
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);

        const body: Record<string, unknown> = {
          mint,
          config,
          // API key is injected automatically -- the session service encrypts it
          // for worker use. The user never provides this manually.
          apiKey: userContext.apiKey,
        };
        if (walletPoolId !== undefined) body['walletPoolId'] = walletPoolId;
        if (walletIds !== undefined) body['walletIds'] = walletIds;

        const res = await api.post(SESSIONS_BASE, body);

        if (res.status === 409) {
          const errBody = await res.text();
          return agentError(
            'SESSION_CONFLICT',
            `A session already exists for this token: ${errBody}`,
            'Only one active session per token per user is allowed. Stop the existing session first with mm-stop-session.',
          );
        }

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'START_SESSION_FAILED',
            `Failed to start session (HTTP ${res.status.toString()}): ${errBody}`,
            'Check wallet balances and config parameters.',
          );
        }

        const data = (await res.json()) as { sessionId?: string };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                sessionId: data.sessionId,
                status: 'active',
                mint,
                message:
                  'Market making session started. Use mm-session-status to monitor.',
                config,
              }),
            },
          ],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Start session request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // ── mm-stop-session ─────────────────────────────────────────────────────

  server.tool(
    'mm-stop-session',
    [
      'Stop a running or paused market making session.',
      'This halts all trading immediately and marks the session as stopped.',
      'Positions are NOT automatically liquidated -- use sell-token or bundle-sell to exit.',
      DISCLAIMER,
    ].join(' '),
    {
      sessionId: z
        .string()
        .describe('Session ID to stop (from mm-list-sessions)'),
    },
    WRITE_ANNOTATIONS,
    async ({ sessionId }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.post(`${SESSIONS_BASE}/${sessionId}/stop`, {});

        if (res.status === 404) {
          return agentError(
            'SESSION_NOT_FOUND',
            `Session "${sessionId}" not found.`,
            'Use mm-list-sessions to see available session IDs.',
          );
        }
        if (res.status === 409 || res.status === 400) {
          const errBody = await res.text();
          return agentError(
            'INVALID_STATUS',
            `Cannot stop session: ${errBody}`,
            'Session may already be stopped. Use mm-session-status to check.',
          );
        }
        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'STOP_SESSION_FAILED',
            `Failed to stop session (HTTP ${res.status.toString()}): ${errBody}`,
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                sessionId,
                status: 'stopped',
                message:
                  'Session stopped. Positions remain open -- use sell-token to exit if needed.',
              }),
            },
          ],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Stop session failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // ── mm-pause-session ────────────────────────────────────────────────────

  server.tool(
    'mm-pause-session',
    [
      'Pause a running market making session.',
      'The session stops trading but retains its position and config.',
      'Use mm-resume-session to continue trading.',
      DISCLAIMER,
    ].join(' '),
    {
      sessionId: z
        .string()
        .describe('Session ID to pause (from mm-list-sessions)'),
    },
    WRITE_ANNOTATIONS,
    async ({ sessionId }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.post(`${SESSIONS_BASE}/${sessionId}/pause`, {});

        if (res.status === 404) {
          return agentError(
            'SESSION_NOT_FOUND',
            `Session "${sessionId}" not found.`,
            'Use mm-list-sessions to see available session IDs.',
          );
        }
        if (res.status === 409 || res.status === 400) {
          const errBody = await res.text();
          return agentError(
            'INVALID_STATUS',
            `Cannot pause session: ${errBody}`,
            'Session may not be in "active" status. Use mm-session-status to check.',
          );
        }
        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'PAUSE_SESSION_FAILED',
            `Failed to pause session (HTTP ${res.status.toString()}): ${errBody}`,
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                sessionId,
                status: 'paused',
                message: 'Session paused. Use mm-resume-session to continue.',
              }),
            },
          ],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Pause session failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // ── mm-resume-session ───────────────────────────────────────────────────

  server.tool(
    'mm-resume-session',
    [
      'Resume a paused market making session.',
      'Trading will restart from where it left off with the same config.',
      DISCLAIMER,
    ].join(' '),
    {
      sessionId: z
        .string()
        .describe('Session ID to resume (from mm-list-sessions)'),
    },
    WRITE_ANNOTATIONS,
    async ({ sessionId }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.post(`${SESSIONS_BASE}/${sessionId}/resume`, {});

        if (res.status === 404) {
          return agentError(
            'SESSION_NOT_FOUND',
            `Session "${sessionId}" not found.`,
            'Use mm-list-sessions to see available session IDs.',
          );
        }
        if (res.status === 409 || res.status === 400) {
          const errBody = await res.text();
          return agentError(
            'INVALID_STATUS',
            `Cannot resume session: ${errBody}`,
            'Session may not be in "paused" status. Use mm-session-status to check.',
          );
        }
        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'RESUME_SESSION_FAILED',
            `Failed to resume session (HTTP ${res.status.toString()}): ${errBody}`,
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                sessionId,
                status: 'active',
                message: 'Session resumed. Trading will restart on next tick.',
              }),
            },
          ],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Resume session failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // ── mm-session-status ───────────────────────────────────────────────────

  server.tool(
    'mm-session-status',
    [
      'Get detailed status of a market making session including config, live stats, and recent trades.',
      'Returns a human-readable summary alongside raw data.',
      DISCLAIMER,
    ].join(' '),
    {
      sessionId: z
        .string()
        .describe('Session ID to inspect (from mm-list-sessions)'),
    },
    READ_ANNOTATIONS,
    async ({ sessionId }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get(`${SESSIONS_BASE}/${sessionId}`);

        if (res.status === 404) {
          return agentError(
            'SESSION_NOT_FOUND',
            `Session "${sessionId}" not found.`,
            'Use mm-list-sessions to see available session IDs.',
          );
        }
        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'API_ERROR',
            `Failed to fetch session status (HTTP ${res.status.toString()}): ${errBody}`,
          );
        }

        const session = (await res.json()) as {
          id: string;
          status: string;
          mint: string;
          config: Record<string, unknown>;
          stats: Record<string, unknown>;
          walletPoolId: string | null;
          walletIds: string[];
          errorMessage: string | null;
          startedAt: string | null;
          pausedAt: string | null;
          stoppedAt: string | null;
          createdAt: string;
          updatedAt: string;
        };

        const stats = session.stats as {
          tradesExecuted?: number;
          buyCount?: number;
          sellCount?: number;
          totalVolumeSol?: string;
          realizedPnlSol?: string;
          unrealizedPnlSol?: string;
          currentPositionSol?: string;
          maxDrawdownPercent?: number;
          lastTradeAt?: string | null;
        };

        // Build human-readable summary
        const summary = [
          `Session: ${session.id}`,
          `Status: ${session.status.toUpperCase()}`,
          `Token: ${session.mint}`,
          `Created: ${session.createdAt}`,
          session.startedAt ? `Started: ${session.startedAt}` : null,
          session.pausedAt ? `Paused: ${session.pausedAt}` : null,
          session.stoppedAt ? `Stopped: ${session.stoppedAt}` : null,
          session.errorMessage ? `Error: ${session.errorMessage}` : null,
          '',
          '--- Stats ---',
          `Trades: ${(stats.tradesExecuted ?? 0).toString()} (${(stats.buyCount ?? 0).toString()} buys, ${(stats.sellCount ?? 0).toString()} sells)`,
          `Volume: ${toSol(stats.totalVolumeSol)} SOL`,
          `Position: ${toSol(stats.currentPositionSol)} SOL`,
          `Realized P&L: ${toSol(stats.realizedPnlSol)} SOL`,
          `Unrealized P&L: ${toSol(stats.unrealizedPnlSol)} SOL`,
          `Max Drawdown: ${(stats.maxDrawdownPercent ?? 0).toFixed(2)}%`,
          stats.lastTradeAt ? `Last Trade: ${stats.lastTradeAt}` : 'No trades yet',
        ]
          .filter(Boolean)
          .join('\n');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ summary, session }),
            },
          ],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Session status request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // ── mm-list-sessions ────────────────────────────────────────────────────

  server.tool(
    'mm-list-sessions',
    [
      'List all market making sessions for the authenticated user.',
      'Optionally filter by status (active, paused, stopped, error).',
      'Returns a human-readable summary table alongside raw data.',
      DISCLAIMER,
    ].join(' '),
    {
      status: z
        .enum(['active', 'paused', 'stopped', 'error'])
        .optional()
        .describe('Filter by session status. Omit to return all sessions.'),
    },
    READ_ANNOTATIONS,
    async ({ status }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const params = new URLSearchParams();
        if (status !== undefined) params.set('status', status);
        const queryString = params.toString();
        const path = queryString
          ? `${SESSIONS_BASE}?${queryString}`
          : SESSIONS_BASE;

        const res = await api.get(path);

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'API_ERROR',
            `Failed to list sessions (HTTP ${res.status.toString()}): ${errBody}`,
          );
        }

        const body = (await res.json()) as {
          sessions?: Array<{
            id: string;
            status: string;
            mint: string;
            stats: {
              tradesExecuted?: number;
              realizedPnlSol?: string;
            };
            createdAt: string;
          }>;
        };
        const sessions = body.sessions ?? [];

        if (sessions.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  summary: status
                    ? `No ${status} sessions found.`
                    : 'No market making sessions found. Use mm-start-session to create one.',
                  sessions: [],
                  count: 0,
                }),
              },
            ],
          };
        }

        const lines = sessions.map((s) => {
          const pnl = toSol(s.stats.realizedPnlSol);
          return `${s.id.slice(0, 8)}... | ${s.status.padEnd(7)} | ${s.mint.slice(0, 8)}... | ${(s.stats.tradesExecuted ?? 0).toString().padStart(4)} trades | P&L: ${pnl} SOL | ${s.createdAt}`;
        });

        const summary = [
          `Found ${sessions.length.toString()} session(s)${status ? ` with status "${status}"` : ''}:`,
          '',
          'ID       | Status  | Token    | Trades | P&L          | Started',
          '-'.repeat(80),
          ...lines,
        ].join('\n');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ summary, sessions, count: sessions.length }),
            },
          ],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `List sessions request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // ── mm-update-strategy ──────────────────────────────────────────────────

  server.tool(
    'mm-update-strategy',
    [
      'Hot-update strategy parameters on a running or paused session.',
      'Only the fields you provide will be updated -- other config values remain unchanged.',
      'Changes take effect on the next tick.',
      DISCLAIMER,
    ].join(' '),
    {
      sessionId: z
        .string()
        .describe('Session ID to update (from mm-list-sessions)'),
      config: MMSessionConfigPartialSchema.describe(
        'Partial config -- only include the fields you want to change.',
      ),
    },
    WRITE_ANNOTATIONS,
    async ({ sessionId, config }) => {
      // Ensure at least one field is being updated
      const updatedFields = Object.keys(config).filter(
        (k) => (config as Record<string, unknown>)[k] !== undefined,
      );
      if (updatedFields.length === 0) {
        return agentError(
          'INVALID_INPUT',
          'No config fields provided. Include at least one field to update.',
          'Example: { netBias: 0.7 } to increase buy bias.',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.patch(`${SESSIONS_BASE}/${sessionId}`, {
          config,
        });

        if (res.status === 404) {
          return agentError(
            'SESSION_NOT_FOUND',
            `Session "${sessionId}" not found.`,
            'Use mm-list-sessions to see available session IDs.',
          );
        }
        if (res.status === 409 || res.status === 400) {
          const errBody = await res.text();
          return agentError(
            'INVALID_STATUS',
            `Cannot update strategy: ${errBody}`,
            'Strategy can only be updated on active or paused sessions.',
          );
        }
        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'UPDATE_STRATEGY_FAILED',
            `Failed to update strategy (HTTP ${res.status.toString()}): ${errBody}`,
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                sessionId,
                updatedFields,
                message: 'Strategy updated. Changes take effect on next tick.',
              }),
            },
          ],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Update strategy request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // ── mm-get-pnl ──────────────────────────────────────────────────────────

  server.tool(
    'mm-get-pnl',
    [
      'Get a detailed P&L report for a market making session.',
      'Returns WAC cost basis, realized P&L, dual unrealized P&L (mark-to-market AND slippage-adjusted sell simulation),',
      'fees, ROI%, and position summary. The simulated sell shows what you would actually receive after bonding curve slippage.',
      DISCLAIMER,
    ].join(' '),
    {
      sessionId: z
        .string()
        .describe('Session ID to get P&L for (from mm-list-sessions)'),
    },
    READ_ANNOTATIONS,
    async ({ sessionId }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get(`${SESSIONS_BASE}/${sessionId}/pnl`);

        if (res.status === 404) {
          return agentError(
            'SESSION_NOT_FOUND',
            `Session "${sessionId}" not found.`,
            'Use mm-list-sessions to find valid session IDs.',
          );
        }

        if (res.status === 403) {
          return agentError(
            'FORBIDDEN',
            'This session does not belong to your account.',
            'Verify the session ID is correct.',
          );
        }

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'API_ERROR',
            `Failed to fetch P&L report (HTTP ${res.status.toString()}): ${errBody}`,
            'Try again in a few seconds.',
          );
        }

        const report = (await res.json()) as Record<string, unknown>;

        // Format as human-readable text for agent consumption
        const lines = [
          `=== P&L Report: Session ${sessionId} ===`,
          `Token: ${String(report.mint)}`,
          '',
          '--- Position Summary ---',
          `Buys: ${String(report.buyCount)} | Sells: ${String(report.sellCount)}`,
          `SOL Spent: ${toSol(String(report.totalSolSpent))} SOL`,
          `SOL Received: ${toSol(String(report.totalSolReceived))} SOL`,
          `Remaining Tokens: ${String(report.remainingTokens)} base units`,
          '',
          '--- Cost Basis (WAC) ---',
          `Cost of Sold: ${toSol(String(report.costBasisOfSoldTokens))} SOL`,
          `Cost of Remaining: ${toSol(String(report.costBasisOfRemainingTokens))} SOL`,
          '',
          '--- Realized P&L ---',
          `Realized: ${String(report.realizedPnlSol)} SOL`,
          '',
          '--- Unrealized P&L ---',
          report.unrealizedPnlMark === null || report.unrealizedPnlMark === undefined
            ? 'Mark-to-Market: N/A (token graduated or curve unavailable)'
            : `Mark-to-Market: ${toSol(report.unrealizedPnlMark as string)} SOL`,
          report.unrealizedPnlSimulated === null || report.unrealizedPnlSimulated === undefined
            ? 'Simulated Sell: N/A'
            : `Simulated Sell: ${toSol(report.unrealizedPnlSimulated as string)} SOL`,
          report.slippagePercent === null || report.slippagePercent === undefined
            ? 'Slippage: N/A'
            : `Slippage: ${(report.slippagePercent as number).toString()}%`,
          '',
          '--- Net P&L ---',
          `Net P&L: ${String(report.netPnlSol)} SOL`,
          `ROI: ${String(report.roiPercent)}%`,
          `Total Fees: ${toSol(String(report.totalFees))} SOL`,
          '',
          `Duration: ${String(report.durationMs)}ms`,
        ];

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `P&L report request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );
}
