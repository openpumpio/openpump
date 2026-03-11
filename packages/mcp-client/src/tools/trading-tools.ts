/**
 * Trading tools for the OpenPump MCP server.
 *
 * - bundle-buy: coordinated multi-wallet buy at token creation (Jito bundles)
 * - bundle-sell: multi-wallet sell packed into Jito bundles
 * - buy-token: buy a PumpFun token with SOL (calls REST API synchronously)
 * - sell-token: sell a token position back to SOL (calls REST API synchronously)
 * - estimate-bundle-cost: cost preview without submitting any transaction (sync math)
 * - claim-creator-fees: claim accumulated creator fees (calls REST API synchronously)
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { UserContext } from '../lib/context.js';
import { createApiClient } from '../lib/api-client.js';

const DISCLAIMER = 'Not available to US persons. Use at own risk.';

/**
 * The four priority levels exposed on buy/sell/bundle operations.
 * These map to Jito tip floor percentiles as cached by the backend.
 *   economy -> 25th percentile  (~1 000 - 10 000 lamports)
 *   normal  -> EMA 50th         (~2 000 - 100 000 lamports)
 *   fast    -> 75th percentile  (~10 000 - 500 000 lamports)
 *   turbo   -> 95th percentile  (~100 000 - 1 000 000 lamports)
 * Use economy for low-urgency trades; turbo for time-sensitive execution.
 */
const PRIORITY_LEVEL_SCHEMA = z
  .enum(['economy', 'normal', 'fast', 'turbo'])
  .optional()
  .default('normal')
  .describe(
    "Transaction priority tier. Maps to Jito tip floor percentiles: 'economy' (25th), 'normal' (50th EMA, default), 'fast' (75th), 'turbo' (95th). Higher = faster inclusion, higher fee.",
  );

/** Approximate Jito tip lamports per priority level (used for synchronous cost estimates). */
const APPROX_TIP_LAMPORTS: Record<string, number> = {
  economy: 1000,
  normal: 50_000,
  fast: 200_000,
  turbo: 1_000_000,
};

const RICO_WARNING =
  'LEGAL DISCLAIMER: Coordinated bundle buying (wash trading / simultaneous multi-wallet purchase at token creation) ' +
  'may be subject to legal restrictions in your jurisdiction. A RICO lawsuit filed July 2025 is active against ' +
  'bundling services. By setting confirm=true you acknowledge awareness of these risks. ' +
  DISCLAIMER;

/**
 * Build an agent-readable error response (never use isError: true for domain errors).
 */
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
 * Validate that an imageUrl is safe to fetch:
 * - Must be https: scheme only
 * - Must not point to a private/internal IP or hostname
 * Throws a descriptive Error if any check fails.
 */
function validateImageUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid imageUrl: not a valid URL`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Invalid imageUrl: must use https`);
  }
  const host = parsed.hostname.toLowerCase();
  const blocked = [
    /^localhost$/,
    /^127\./,
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
  ];
  if (blocked.some((re) => re.test(host))) {
    throw new Error(`Invalid imageUrl: private or internal addresses are not allowed`);
  }
}

/**
 * Fetch the current wallet balance (SOL + tokens) after a trade.
 *
 * Uses POST /wallets/:id/refresh-balance which bypasses the 30s Redis cache and
 * fetches live from RPC -- essential after a buy/sell so the returned balance
 * reflects the actual post-trade state rather than stale cached data.
 *
 * Returns null on error -- callers treat it as a non-fatal enrichment.
 */
async function fetchUpdatedBalance(
  api: ReturnType<typeof createApiClient>,
  walletId: string,
): Promise<{
  solBalance: string;
  lamports: string;
  tokenBalances: Array<{ mint: string; amount: string; uiAmount: number | null; decimals: number }>;
} | null> {
  try {
    // POST refresh-balance forces a live RPC fetch and busts the Redis cache.
    const res = await api.post(`/api/wallets/${walletId}/refresh-balance`, {});
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { solBalance?: string; lamports?: string; tokenBalances?: unknown[] } };
    const d = body.data;
    if (!d) return null;
    return {
      solBalance: d.solBalance ?? '0',
      lamports: d.lamports ?? '0',
      tokenBalances: (d.tokenBalances ?? []) as Array<{ mint: string; amount: string; uiAmount: number | null; decimals: number }>,
    };
  } catch {
    return null;
  }
}

// Solana network fee constants (approximate, may vary)
const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Register all trading tools.
 *
 * bundle-buy includes RICO lawsuit warning per legal requirement (AC #11).
 * estimate-bundle-cost returns synchronous cost estimates.
 */
export function registerTradingTools(server: McpServer, userContext: UserContext, apiBaseUrl: string): void {
  // -- bundle-launch --------------------------------------------------------

  server.tool(
    'bundle-launch',
    [
      RICO_WARNING,
      'Atomically create a new PumpFun token and execute coordinated buys from multiple wallets using Jito MEV bundles.',
      'Buyer instructions are greedily packed: as many wallet buy instructions as fit in 1232 bytes are combined into a single transaction.',
      'Bundle 1 (token creation + packed buyer txs) is atomic and same-block guaranteed.',
      'Additional buyers overflow into subsequent bundles and are NOT guaranteed same-block execution.',
      'Requires confirm: true to execute.',
      'Always run estimate-bundle-cost before this tool to verify sufficient SOL balance.',
      'Returns jobId for async tracking — use poll-job to track status.',
    ].join(' '),
    {
      devWalletId: z.string().describe('ID of the dev/creator wallet'),
      buyWalletIds: z
        .array(z.string())
        .max(20)
        .describe('IDs of wallets to participate in the bundle buy (max 20)'),
      tokenParams: z.object({
        name: z.string().max(32).describe('Token name (max 32 chars)'),
        symbol: z.string().max(10).describe('Token ticker symbol (max 10 chars)'),
        description: z.string().max(500).describe('Token description (max 500 chars)'),
        imageUrl: z.string().url().describe('Token image URL'),
      }),
      devBuyAmountSol: z
        .string()
        .regex(/^\d+(\.\d{1,9})?$/, 'Must be a SOL decimal string')
        .describe('Dev wallet initial buy in SOL (e.g. "0.1" = 0.1 SOL). Use "0" for no dev buy.'),
      walletBuyAmounts: z
        .array(z.string().regex(/^\d+(\.\d{1,9})?$/, 'Must be a SOL decimal string'))
        .describe('SOL amount per wallet (e.g. ["0.05", "0.1"]), same order as buyWalletIds'),
      slippageBps: z
        .number()
        .int()
        .min(0)
        .max(10_000)
        .optional()
        .describe(
          'Slippage tolerance in basis points (default: 2500 = 25%). ' +
          'IMPORTANT: bundle-launch packs multiple buyer wallets into the same TX — each subsequent buyer within a TX ' +
          'sees a shifted bonding curve, so standard 5% slippage WILL cause errors. ' +
          'Recommended: 2500 (25%) for up to 4 wallets per TX, 5000 (50%) for larger groups.',
        ),
      priorityLevel: PRIORITY_LEVEL_SCHEMA,
      confirm: z
        .boolean()
        .describe(
          'REQUIRED: Must be true to execute. Run estimate-bundle-cost first to see total SOL required.',
        ),
    },
    async ({ devWalletId, buyWalletIds, tokenParams, devBuyAmountSol, walletBuyAmounts, slippageBps, priorityLevel, confirm }) => {
      // Two-step protection: confirm must be explicitly true
      if (!confirm) {
        return agentError(
          'CONFIRMATION_REQUIRED',
          'bundle-launch requires explicit confirmation (confirm: true) before execution.',
          'First run estimate-bundle-cost to see total SOL required. Then call bundle-launch again with confirm: true.',
        );
      }

      // Validate dev wallet belongs to this user
      const devWallet = userContext.wallets.find((w) => w.id === devWalletId);
      if (!devWallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Dev wallet "${devWalletId}" not found for this account.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      // Validate all buy wallet IDs belong to this user
      const missingWallets = buyWalletIds.filter(
        (id) => !userContext.wallets.some((w) => w.id === id),
      );
      if (missingWallets.length > 0) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Buy wallets not found: ${missingWallets.join(', ')}.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      // Validate walletBuyAmounts length matches buyWalletIds
      if (walletBuyAmounts.length !== buyWalletIds.length) {
        return agentError(
          'INVALID_INPUT',
          `walletBuyAmounts length (${walletBuyAmounts.length.toString()}) must match buyWalletIds length (${buyWalletIds.length.toString()}).`,
          'Provide one SOL amount per wallet in buyWalletIds, in the same order.',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);

        // Validate imageUrl before fetching (SSRF guard)
        try {
          validateImageUrl(tokenParams.imageUrl);
        } catch (validationError) {
          return agentError(
            'INVALID_IMAGE_URL',
            validationError instanceof Error ? validationError.message : String(validationError),
            'Provide a publicly accessible https:// image URL that does not point to a private or internal address.',
          );
        }

        // Fetch image from URL and convert to base64
        const imageRes = await fetch(tokenParams.imageUrl, { signal: AbortSignal.timeout(10_000) });
        if (!imageRes.ok) {
          return agentError(
            'IMAGE_FETCH_FAILED',
            `Failed to fetch token image from ${tokenParams.imageUrl}: HTTP ${imageRes.status.toString()}`,
            'Provide a publicly accessible image URL.',
          );
        }
        const imageBuffer = await imageRes.arrayBuffer();
        const imageBase64 = Buffer.from(imageBuffer).toString('base64');
        const contentType = imageRes.headers.get('content-type') ?? 'image/png';
        // Map MIME type to accepted values; default to image/png
        const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
        type AcceptedMime = (typeof ACCEPTED_MIME_TYPES)[number];
        const imageType: AcceptedMime = (
          ACCEPTED_MIME_TYPES.find((m) => contentType.includes(m.split('/')[1] ?? '')) ?? 'image/png'
        );

        // Fetch Jito tip for the chosen priority level to pass as tipLamports
        const approxTipLamports = APPROX_TIP_LAMPORTS[priorityLevel] ?? APPROX_TIP_LAMPORTS['normal'] ?? 50_000;

        const requestBody: Record<string, unknown> = {
          devWalletId,
          buyWalletIds,
          name: tokenParams.name,
          symbol: tokenParams.symbol,
          description: tokenParams.description,
          imageBase64,
          imageType,
          devBuyAmountSol,
          walletBuyAmounts,
          tipLamports: approxTipLamports,
          ...(slippageBps !== undefined && { slippageBps }),
        };

        const res = await api.post('/api/tokens/bundle-launch', requestBody);

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'BUNDLE_LAUNCH_FAILED',
            `Bundle launch failed (HTTP ${res.status.toString()}): ${errBody}`,
            'Check wallet balances and try again.',
          );
        }

        const data = (await res.json()) as { jobId?: string };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                jobId: data.jobId,
                message: 'Bundle launch submitted. Use poll-job to track progress.',
                note: RICO_WARNING,
              }),
            },
          ],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Bundle launch request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // -- bundle-buy -----------------------------------------------------------

  server.tool(
    'bundle-buy',
    [
      RICO_WARNING,
      'Atomically create a new PumpFun token and execute coordinated buys from multiple wallets using Jito MEV bundles.',
      'Bundle 1 (token creation + up to 3 buy wallets) is atomic and same-block guaranteed.',
      'Additional buyers use separate bundles and are NOT guaranteed same-block execution.',
      'Requires confirm: true to execute.',
      'Always run estimate-bundle-cost before this tool to verify sufficient SOL balance.',
      'Returns jobId for async tracking.',
    ].join(' '),
    {
      devWalletId: z.string().describe('ID of the dev/creator wallet'),
      buyWalletIds: z
        .array(z.string())
        .max(20)
        .describe('IDs of wallets to participate in the bundle buy (max 20)'),
      tokenParams: z.object({
        name: z.string().max(32).describe('Token name (max 32 chars)'),
        symbol: z.string().max(10).describe('Token ticker symbol (max 10 chars)'),
        description: z.string().max(500).describe('Token description (max 500 chars)'),
        imageUrl: z.string().url().describe('Token image URL'),
      }),
      devBuyAmountSol: z
        .string()
        .regex(/^\d+$/, 'Must be a decimal integer string')
        .describe('SOL amount for the dev wallet initial buy in lamports (decimal string, e.g. "100000000" = 0.1 SOL)'),
      walletBuyAmounts: z
        .array(z.string().regex(/^\d+$/, 'Must be a decimal integer string'))
        .describe('SOL amount per wallet in lamports (decimal strings), same order as buyWalletIds'),
      priorityLevel: PRIORITY_LEVEL_SCHEMA,
      confirm: z
        .boolean()
        .describe(
          'REQUIRED: Must be true to execute. Run estimate-bundle-cost first to see total SOL required.',
        ),
    },
    async ({ devWalletId, buyWalletIds, tokenParams, devBuyAmountSol, walletBuyAmounts, priorityLevel, confirm }) => {
      // Two-step protection: confirm must be explicitly true
      if (!confirm) {
        return agentError(
          'CONFIRMATION_REQUIRED',
          'bundle-buy requires explicit confirmation (confirm: true) before execution.',
          'First run estimate-bundle-cost to see total SOL required. Then call bundle-buy again with confirm: true.',
        );
      }

      // Validate dev wallet belongs to this user
      const devWallet = userContext.wallets.find((w) => w.id === devWalletId);
      if (!devWallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Dev wallet "${devWalletId}" not found for this account.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      // Validate all buy wallet IDs belong to this user
      const missingWallets = buyWalletIds.filter(
        (id) => !userContext.wallets.some((w) => w.id === id),
      );
      if (missingWallets.length > 0) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Buy wallets not found: ${missingWallets.join(', ')}.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      // Validate walletBuyAmounts length matches buyWalletIds
      if (walletBuyAmounts.length !== buyWalletIds.length) {
        return agentError(
          'INVALID_INPUT',
          `walletBuyAmounts length (${walletBuyAmounts.length.toString()}) must match buyWalletIds length (${buyWalletIds.length.toString()}).`,
          'Provide one SOL amount per wallet in buyWalletIds, in the same order.',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);

        // Fetch image from URL and convert to base64
        const imageRes = await fetch(tokenParams.imageUrl);
        if (!imageRes.ok) {
          return agentError(
            'IMAGE_FETCH_FAILED',
            `Failed to fetch token image from ${tokenParams.imageUrl}: HTTP ${imageRes.status.toString()}`,
            'Provide a publicly accessible image URL.',
          );
        }
        const imageBuffer = await imageRes.arrayBuffer();
        const imageBase64 = Buffer.from(imageBuffer).toString('base64');
        const contentType = imageRes.headers.get('content-type') ?? 'image/png';
        // Map MIME type to accepted values; default to image/png
        const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
        type AcceptedMime = (typeof ACCEPTED_MIME_TYPES)[number];
        const imageType: AcceptedMime = (
          ACCEPTED_MIME_TYPES.find((m) => contentType.includes(m.split('/')[1] ?? '')) ?? 'image/png'
        );

        // Fetch Jito tip for the chosen priority level to pass as tipLamports
        const approxTipLamports = APPROX_TIP_LAMPORTS[priorityLevel] ?? APPROX_TIP_LAMPORTS['normal'] ?? 50_000;

        const requestBody: Record<string, unknown> = {
          devWalletId,
          buyWalletIds,
          name: tokenParams.name,
          symbol: tokenParams.symbol,
          description: tokenParams.description,
          imageBase64,
          imageType,
          devBuyAmountLamports: devBuyAmountSol,
          walletBuyAmounts,
          tipLamports: approxTipLamports,
        };

        const res = await api.post('/api/tokens/bundle-launch', requestBody);

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'BUNDLE_LAUNCH_FAILED',
            `Bundle launch failed (HTTP ${res.status.toString()}): ${errBody}`,
            'Check wallet balances and try again.',
          );
        }

        const data = (await res.json()) as { jobId?: string };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                jobId: data.jobId,
                message: 'Bundle launch submitted. Use poll-job to track progress.',
                note: RICO_WARNING,
              }),
            },
          ],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Bundle launch request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // -- bundle-sell ----------------------------------------------------------

  server.tool(
    'bundle-sell',
    [
      `Sell a PumpFun token from multiple wallets simultaneously using Jito MEV bundles.`,
      'Groups as many wallet sell instructions as possible into each transaction (up to the 1232-byte Solana limit),',
      'then packs transactions into Jito bundles (max 5 txs each). One Jito tip is paid per bundle.',
      'Only supported for bonding curve tokens (not yet graduated to PumpSwap).',
      'Returns bundle statuses and per-wallet warnings.',
      DISCLAIMER,
    ].join(' '),
    {
      mint: z.string().describe('Token mint address (base58)'),
      walletSells: z
        .array(
          z.object({
            walletId: z.string().describe('ID of the wallet holding the token'),
            tokenAmount: z
              .union([
                z
                  .string()
                  .regex(/^\d+$/, 'Must be a decimal integer string')
                  .describe('Raw token base units as a decimal string (e.g. "435541983646")'),
                z.literal('all'),
              ])
              .describe('Amount to sell as raw base units, or "all" to sell entire balance'),
          }),
        )
        .min(1)
        .max(20)
        .describe('Per-wallet sell amounts (1-20 wallets)'),
      tipWalletId: z
        .string()
        .optional()
        .describe('Wallet ID that pays the Jito tip (default: first wallet in walletSells)'),
      slippageBps: z
        .number()
        .int()
        .min(0)
        .max(10_000)
        .optional()
        .describe('Slippage tolerance in basis points (default: 500 = 5%)'),
      priorityLevel: PRIORITY_LEVEL_SCHEMA,
      confirm: z
        .boolean()
        .describe('REQUIRED: Must be true to execute the bundle sell.'),
    },
    async ({ mint, walletSells, tipWalletId, slippageBps, priorityLevel, confirm }) => {
      if (!confirm) {
        return agentError(
          'CONFIRMATION_REQUIRED',
          'bundle-sell requires explicit confirmation (confirm: true) before execution.',
          'Call bundle-sell again with confirm: true to proceed.',
        );
      }

      // Validate all wallets belong to this user
      const missingWallets = walletSells
        .map((ws) => ws.walletId)
        .filter((id) => !userContext.wallets.some((w) => w.id === id));
      if (missingWallets.length > 0) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Wallets not found: ${missingWallets.join(', ')}.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      if (tipWalletId !== undefined && !userContext.wallets.some((w) => w.id === tipWalletId)) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Tip wallet "${tipWalletId}" not found for this account.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);

        const body: Record<string, unknown> = {
          walletSells,
          priorityLevel,
        };
        if (tipWalletId !== undefined) body['tipWalletId'] = tipWalletId;
        if (slippageBps !== undefined) body['slippageBps'] = slippageBps;

        const res = await api.post(`/api/tokens/${mint}/bundle-sell`, body);

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'BUNDLE_SELL_FAILED',
            `Bundle sell failed (HTTP ${res.status.toString()}): ${errBody}`,
            'Check wallet balances and that the token is still on the bonding curve.',
          );
        }

        const data: unknown = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Bundle sell request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // -- buy-token ------------------------------------------------------------

  server.tool(
    'buy-token',
    `Buy a PumpFun token with SOL from the specified wallet. Submits a swap transaction on the bonding curve. Returns the transaction result directly. ${DISCLAIMER}`,
    {
      walletId: z.string().describe('ID of the wallet to buy with'),
      mint: z.string().describe('Token mint address (base58)'),
      amountSol: z
        .string()
        .regex(/^\d+$/, 'Must be a decimal integer string')
        .describe(
          'Amount of SOL to spend in lamports (decimal string, e.g. "100000000" = 0.1 SOL). IMPORTANT: use the exact integer string -- do NOT use floats or decimals.',
        ),
      slippageBps: z
        .number()
        .int()
        .min(0)
        .max(10_000)
        .optional()
        .describe('Slippage tolerance in basis points (default: 500 = 5%)'),
      priorityLevel: PRIORITY_LEVEL_SCHEMA,
    },
    async ({ walletId, mint, amountSol, slippageBps, priorityLevel }) => {
      const wallet = userContext.wallets.find((w) => w.id === walletId);
      if (!wallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Wallet "${walletId}" not found.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const body: Record<string, unknown> = {
          walletId,
          amountLamports: amountSol, // API expects lamports as decimal string
          priorityLevel,
        };
        if (slippageBps !== undefined) {
          body['slippageBps'] = slippageBps;
        }

        const res = await api.post(`/api/tokens/${mint}/buy`, body);

        if (res.status === 404) {
          return agentError(
            'WALLET_NOT_FOUND',
            `Wallet "${walletId}" could not be resolved by the API.`,
            'Ensure the wallet keypair is configured on the server.',
          );
        }

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'BUY_FAILED',
            `Buy transaction failed (HTTP ${res.status.toString()}): ${errBody}`,
            'Check the wallet has sufficient SOL and try again.',
          );
        }

        const data = (await res.json()) as Record<string, unknown>;

        // Fetch updated balance so agent doesn't need a follow-up call
        const updatedBalance = await fetchUpdatedBalance(api, walletId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ...data, updatedWalletBalance: updatedBalance }),
            },
          ],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Buy request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // -- sell-token -----------------------------------------------------------

  server.tool(
    'sell-token',
    `Sell a PumpFun token back to SOL from the specified wallet. Use tokenAmount: "all" to sell the entire balance. Returns the transaction result directly. ${DISCLAIMER}`,
    {
      walletId: z.string().describe('ID of the wallet holding the token'),
      mint: z.string().describe('Token mint address (base58)'),
      tokenAmount: z
        .union([
          z
            .string()
            .regex(/^\d+$/, 'Must be a decimal integer string')
            .describe(
              'Raw token base units as a decimal string (same as the "amount" field from get-wallet-balance/get-token-holdings, e.g. "435541983646"). IMPORTANT: use the exact string -- do NOT convert to a JS number.',
            ),
          z.literal('all'),
        ])
        .describe('Raw token base units as a decimal string, or "all" to sell the entire balance. Use get-token-holdings to get the raw "amount" string for a specific wallet.'),
      slippageBps: z
        .number()
        .int()
        .min(0)
        .max(10_000)
        .optional()
        .describe('Slippage tolerance in basis points (default: 500 = 5%)'),
      priorityLevel: PRIORITY_LEVEL_SCHEMA,
    },
    async ({ walletId, mint, tokenAmount, slippageBps, priorityLevel }) => {
      const wallet = userContext.wallets.find((w) => w.id === walletId);
      if (!wallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Wallet "${walletId}" not found.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const body: Record<string, unknown> = {
          walletId,
          tokenAmount,
          priorityLevel,
        };
        if (slippageBps !== undefined) {
          body['slippageBps'] = slippageBps;
        }

        const res = await api.post(`/api/tokens/${mint}/sell`, body);

        if (res.status === 404) {
          return agentError(
            'WALLET_NOT_FOUND',
            `Wallet "${walletId}" could not be resolved by the API.`,
            'Ensure the wallet keypair is configured on the server.',
          );
        }

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'SELL_FAILED',
            `Sell transaction failed (HTTP ${res.status.toString()}): ${errBody}`,
            'Check the wallet has sufficient token balance and try again.',
          );
        }

        const data = (await res.json()) as Record<string, unknown>;

        // Fetch updated balance so agent doesn't need a follow-up call
        const updatedBalance = await fetchUpdatedBalance(api, walletId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ...data, updatedWalletBalance: updatedBalance }),
            },
          ],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Sell request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // -- estimate-bundle-cost -------------------------------------------------
  // Synchronous math -- no API call needed.

  server.tool(
    'estimate-bundle-cost',
    [
      'Estimate the total SOL required for a bundle launch before executing.',
      'Run this before bundle-buy to verify sufficient wallet balances.',
      'Returns a breakdown of tip, network fees, and buy amounts.',
      DISCLAIMER,
    ].join(' '),
    {
      buyWalletCount: z
        .number()
        .int()
        .min(1)
        .max(20)
        .describe('Number of buy wallets (max 20)'),
      devBuyAmountSol: z
        .string()
        .regex(/^\d+$/, 'Must be a decimal integer string')
        .describe('Dev wallet buy amount in lamports (decimal string, e.g. "100000000" = 0.1 SOL)'),
      walletBuyAmounts: z
        .array(z.string().regex(/^\d+$/, 'Must be a decimal integer string'))
        .describe('SOL amount per buy wallet in lamports (decimal strings), in the same order as buyWalletIds will be'),
      tipLamports: z
        .number()
        .int()
        .min(1000)
        .optional()
        .describe('Jito MEV tip in lamports (default: 1,000,000 = 0.001 SOL)'),
      priorityLevel: PRIORITY_LEVEL_SCHEMA,
    },
    ({ buyWalletCount, devBuyAmountSol, walletBuyAmounts, tipLamports: customTipLamports, priorityLevel }) => {
      const approxTipLamports = customTipLamports ?? APPROX_TIP_LAMPORTS[priorityLevel] ?? APPROX_TIP_LAMPORTS['normal'] ?? 50_000;
      const tipBI = BigInt(approxTipLamports);

      // Fee constants in lamports
      const TOKEN_CREATION_FEE_LAMPORTS = 20_000_000n; // 0.02 SOL
      const TOKEN_ACCOUNT_RENT_LAMPORTS = 2_049_280n;  // 0.00204928 SOL
      const NETWORK_FEE_PER_TX_LAMPORTS = 5000n;      // ~5000 lamports per sig

      const txCount = BigInt(1 + buyWalletCount);
      const networkFeesLamports = txCount * NETWORK_FEE_PER_TX_LAMPORTS;
      const devBuyLamports = BigInt(devBuyAmountSol);
      const walletBuysLamports = walletBuyAmounts.reduce((sum, amt) => sum + BigInt(amt), 0n);
      const rentLamports = BigInt(buyWalletCount + 1) * TOKEN_ACCOUNT_RENT_LAMPORTS;

      const totalLamports =
        tipBI + networkFeesLamports + devBuyLamports + walletBuysLamports + rentLamports + TOKEN_CREATION_FEE_LAMPORTS;

      const warnings: string[] = [];
      if (buyWalletCount > 3) {
        warnings.push(
          'Wallets beyond index 3 are NOT guaranteed same-block as creation (not atomic). Consider whether this is acceptable.',
        );
      }
      if (walletBuyAmounts.some((amt) => BigInt(amt) < 10_000_000n)) {
        warnings.push(
          'Some wallet buy amounts are below 10000000 lamports (0.01 SOL). Very small buys may fail due to minimum transaction size requirements.',
        );
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              totalLamports: totalLamports.toString(),
              totalSolApprox: (Number(totalLamports) / LAMPORTS_PER_SOL).toFixed(9),
              breakdown: {
                tipCostLamports: tipBI.toString(),
                networkFeesLamports: networkFeesLamports.toString(),
                tokenCreationFeeLamports: TOKEN_CREATION_FEE_LAMPORTS.toString(),
                devBuyLamports: devBuyLamports.toString(),
                walletBuysLamports: walletBuysLamports.toString(),
                tokenAccountRentsLamports: rentLamports.toString(),
              },
              warnings,
              note: `Estimates are approximate. Jito tip for '${priorityLevel}' tier uses ~${approxTipLamports.toLocaleString()} lamports (live values fetched at execution time may differ). Total fees may vary by +/-20% based on network congestion.`,
            }),
          },
        ],
      };
    },
  );

  // -- claim-creator-fees ---------------------------------------------------

  server.tool(
    'claim-creator-fees',
    [
      'Claim all accumulated creator fees for a wallet address.',
      'Fees are per creator wallet (covering ALL tokens launched from that address) -- one transaction claims everything.',
      'Run get-creator-fees first to check the claimable balance.',
      `Returns signature and amount claimed. ${DISCLAIMER}`,
    ].join(' '),
    {
      creatorAddress: z
        .string()
        .describe(
          'Creator wallet address (base58) to claim fees for. Must be one of your platform wallets.',
        ),
    },
    async ({ creatorAddress }) => {
      // Verify the address belongs to one of this user's wallets before making the API call
      const wallet = userContext.wallets.find((w) => w.publicKey === creatorAddress);
      if (!wallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Address "${creatorAddress}" is not one of your platform wallets.`,
          'Use get-creator-fees (no address) to see all your wallets and their claimable fees.',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.post('/api/creator-fees/claim', { creatorAddress });

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'CLAIM_FEES_FAILED',
            `Claim fees failed (HTTP ${res.status.toString()}): ${errBody}`,
            'Ensure the wallet has accumulated fees. Run get-creator-fees to check.',
          );
        }

        const data: unknown = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Claim fees request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );
}
