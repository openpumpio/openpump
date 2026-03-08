/**
 * Information/read-only tools for the OpenPump MCP server.
 *
 * All tools return synchronous responses (no blockchain writes).
 * - get-token-info:         bonding curve state for a PumpFun token
 * - get-token-market-info:  rich analytics from the analytics service (mainnet only)
 * - list-my-tokens:         tokens launched by the authenticated user
 * - get-token-holdings:     which platform wallets hold a specific token
 * - get-wallet-balance:     SOL and token balances for a single wallet
 * - list-wallets:           all wallets for the authenticated user
 * - get-creator-fees:       accumulated PumpFun creator fees
 * - get-token-quote:        price quote without submitting a transaction
 * - get-jito-tip-levels:    current Jito MEV tip amounts
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { UserContext } from '../lib/context.js';
import { createApiClient } from '../lib/api-client.js';

const DISCLAIMER = 'Not available to US persons. Use at own risk.';

/**
 * Build an agent-readable error response.
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
 * Register all informational tools.
 * These tools return data without submitting any transactions.
 */
export function registerInfoTools(server: McpServer, userContext: UserContext, apiBaseUrl: string): void {
  // -- get-token-info -------------------------------------------------------
  // Public read -- calls GET /api/tokens/:mint/curve-state on the REST API.

  server.tool(
    'get-token-info',
    `Get current info about a PumpFun token: name, symbol, price, market cap, bonding curve progress, and graduation status. This is a public read -- no authentication required. ${DISCLAIMER}`,
    {
      mint: z.string().describe('Token mint address (base58)'),
    },
    async ({ mint }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get(`/api/tokens/${mint}/curve-state`);

        if (res.status === 404) {
          return agentError(
            'TOKEN_NOT_FOUND',
            `Token with mint "${mint}" was not found on PumpFun.`,
            'Verify the mint address is correct and the token exists on pump.fun.',
          );
        }

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'API_ERROR',
            `Failed to fetch token info (HTTP ${res.status.toString()}): ${errBody}`,
            'Try again in a few seconds. If the error persists, the API may be unavailable.',
          );
        }

        const data: unknown = await res.json();

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        };
      } catch (error) {
        return agentError(
          'RPC_ERROR',
          `Failed to fetch token info: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds. If the error persists, the Solana RPC may be degraded.',
        );
      }
    },
  );

  // -- get-token-market-info ------------------------------------------------
  // Proxies to the internal analytics service via GET /api/tokens/:mint/market-info.
  // Only populated on mainnet; returns { data: null } on devnet without error.

  server.tool(
    'get-token-market-info',
    [
      'Get rich market analytics for any Solana token: price (SOL + USD), market cap, 24h volume, buy/sell counts, price change percentages, and risk metrics (snipers, bundlers, insiders).',
      'Mainnet only -- returns null data on devnet.',
      'Use this before deciding when to sell: high sniper count or unusual price action may signal a rug.',
      DISCLAIMER,
    ].join(' '),
    {
      mint: z.string().describe('Token mint address (base58)'),
    },
    async ({ mint }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get(`/api/tokens/${mint}/market-info`);

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'API_ERROR',
            `Failed to fetch market info (HTTP ${res.status.toString()}): ${errBody}`,
            'Try again in a few seconds.',
          );
        }

        const data: unknown = await res.json();

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Market info request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // -- list-my-tokens -------------------------------------------------------
  // Returns the authenticated user's launched tokens from GET /api/tokens.

  server.tool(
    'list-my-tokens',
    [
      'List all tokens launched by the authenticated user.',
      'Returns mint address, name, symbol, graduation status (active/graduated), metadata URI, and creation timestamp.',
      'Combine with get-token-market-info to enrich each token with live price and volume data.',
      DISCLAIMER,
    ].join(' '),
    {}, // No parameters -- scoped to authenticated user automatically
    async () => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get('/api/tokens');

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'API_ERROR',
            `Failed to fetch token list (HTTP ${res.status.toString()}): ${errBody}`,
            'Try again in a few seconds.',
          );
        }

        const data: unknown = await res.json();

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Token list request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // -- get-token-holdings ---------------------------------------------------
  // Checks all platform wallets for holdings of a specific mint by iterating
  // GET /api/wallets/:id/balance for each wallet and filtering by mint.

  server.tool(
    'get-token-holdings',
    [
      'Check which of the user\'s platform wallets hold a specific token, and how much.',
      'Omit mint to see ALL tokens held across every wallet -- useful when you know the symbol/name but not the mint address.',
      'Provide mint to filter to that specific token only.',
      'Returns wallets with a positive balance.',
      'Use this before sell-token to know which walletIds and amounts to sell.',
      DISCLAIMER,
    ].join(' '),
    {
      mint: z.string().optional().describe('Token mint address (base58) to check holdings for. Omit to return ALL token holdings across all wallets.'),
    },
    async ({ mint }) => {
      // Use the cached wallet list from userContext -- no extra API call needed
      const wallets = userContext.wallets;

      if (wallets.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ holdings: [], note: 'No platform wallets configured.' }),
            },
          ],
        };
      }

      const api = createApiClient(userContext.apiKey, apiBaseUrl);

      // Fetch balances for all wallets in parallel
      const balanceResults = await Promise.allSettled(
        wallets.map(async (w) => {
          const res = await api.get(`/api/wallets/${w.id}/balance`);
          if (!res.ok) throw new Error(`HTTP ${res.status.toString()} for wallet ${w.id}`);
          const body = (await res.json()) as {
            data: {
              tokenBalances: Array<{
                mint: string;
                amount: string;
                uiAmount: number | null;
                decimals: number;
              }>;
            };
          };
          return { wallet: w, tokenBalances: body.data.tokenBalances };
        }),
      );

      // -- Filter mode: specific mint ----------------------------------------
      if (mint !== undefined) {
        const holdings: Array<{
          walletId: string;
          walletLabel: string;
          publicKey: string;
          amount: string;
          uiAmount: number | null;
          decimals: number;
        }> = [];

        for (const result of balanceResults) {
          if (result.status !== 'fulfilled') continue;
          const { wallet, tokenBalances } = result.value;

          const entry = tokenBalances.find((tb) => tb.mint === mint);
          if (!entry) continue;

          const hasBalance =
            entry.uiAmount === null ? entry.amount !== '0' : entry.uiAmount > 0;
          if (!hasBalance) continue;

          holdings.push({
            walletId: wallet.id,
            walletLabel: wallet.label ?? '',
            publicKey: wallet.publicKey,
            amount: entry.amount,
            uiAmount: entry.uiAmount,
            decimals: entry.decimals,
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                mint,
                holdings,
                totalHoldingWallets: holdings.length,
                note:
                  holdings.length === 0
                    ? 'No platform wallets hold this token.'
                    : `${holdings.length.toString()} wallet(s) hold this token. Pass the "amount" string directly to sell-token as tokenAmount to sell the exact on-chain balance with no float rounding.`,
              }),
            },
          ],
        };
      }

      // -- Aggregate mode: all tokens across all wallets ---------------------
      const allHoldings: Array<{
        mint: string;
        walletId: string;
        walletLabel: string;
        publicKey: string;
        amount: string;
        uiAmount: number | null;
        decimals: number;
      }> = [];

      for (const result of balanceResults) {
        if (result.status !== 'fulfilled') continue;
        const { wallet, tokenBalances } = result.value;

        for (const entry of tokenBalances) {
          const hasBalance =
            entry.uiAmount === null ? entry.amount !== '0' : entry.uiAmount > 0;
          if (!hasBalance) continue;

          allHoldings.push({
            mint: entry.mint,
            walletId: wallet.id,
            walletLabel: wallet.label ?? '',
            publicKey: wallet.publicKey,
            amount: entry.amount,
            uiAmount: entry.uiAmount,
            decimals: entry.decimals,
          });
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              holdings: allHoldings,
              totalTokenPositions: allHoldings.length,
              note:
                allHoldings.length === 0
                  ? 'No token holdings found across any platform wallet.'
                  : `${allHoldings.length.toString()} token position(s) found. Use the "mint" field with sell-token, and "amount" as tokenAmount for exact on-chain sells with no float rounding.`,
            }),
          },
        ],
      };
    },
  );

  // -- get-wallet-balance ---------------------------------------------------

  server.tool(
    'get-wallet-balance',
    `Get the SOL balance and all token balances held by the specified wallet. Returns real-time on-chain data. ${DISCLAIMER}`,
    {
      walletId: z.string().describe('ID of the wallet to check balance for'),
    },
    async ({ walletId }) => {
      const wallet = userContext.wallets.find((w) => w.id === walletId);
      if (!wallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Wallet "${walletId}" not found for this account.`,
          'Use list-wallets to see available wallet IDs and their public keys.',
        );
      }

      try {
        // Call GET /api/wallets/:id/balance -- requires auth, wallet scoped to user
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get(`/api/wallets/${walletId}/balance`);

        if (res.status === 404) {
          return agentError(
            'WALLET_NOT_FOUND',
            `Wallet "${walletId}" not found or not accessible.`,
            'Use list-wallets to see available wallet IDs.',
          );
        }

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'API_ERROR',
            `Failed to fetch wallet balance (HTTP ${res.status.toString()}): ${errBody}`,
            'Try again in a few seconds.',
          );
        }

        const data: unknown = await res.json();

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        };
      } catch (error) {
        return agentError(
          'RPC_ERROR',
          `Failed to fetch balance for wallet ${wallet.publicKey}: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // -- get-creator-fees -----------------------------------------------------
  //
  // Calls GET /api/creator-fees?address=<pubkey> (public endpoint, no extra auth).
  // With no address: returns fees for all of the user's wallets in parallel.
  // With an address: returns fees for that specific creator address.

  server.tool(
    'get-creator-fees',
    [
      'Check accumulated PumpFun creator fees for one or all wallets.',
      'Fees accumulate in a single creator vault per wallet address, covering ALL tokens launched from that wallet.',
      'Omit address to check fees across all of your platform wallets at once.',
      'Provide an address to check a specific creator (including wallets not on this platform).',
      DISCLAIMER,
    ].join(' '),
    {
      address: z
        .string()
        .optional()
        .describe(
          'Creator wallet address (base58) to check fees for. Omit to check all your wallets.',
        ),
    },
    async ({ address }) => {
      const api = createApiClient(userContext.apiKey, apiBaseUrl);

      // Single address query
      if (address) {
        try {
          const res = await api.get(`/api/creator-fees?address=${address}`);
          if (!res.ok) {
            const errBody = await res.text();
            return agentError(
              'API_ERROR',
              `Failed to fetch creator fees (HTTP ${res.status.toString()}): ${errBody}`,
              'Verify the address is a valid base58 Solana public key.',
            );
          }
          const data: unknown = await res.json();
          return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
        } catch (error) {
          return agentError(
            'API_ERROR',
            `Creator fees request failed: ${error instanceof Error ? error.message : String(error)}`,
            'Try again in a few seconds.',
          );
        }
      }

      // All wallets -- fetch in parallel
      const wallets = userContext.wallets;
      if (wallets.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                wallets: [],
                totalAccumulatedSOL: 0,
                note: 'No platform wallets found.',
              }),
            },
          ],
        };
      }

      const results = await Promise.allSettled(
        wallets.map(async (w) => {
          const res = await api.get(`/api/creator-fees?address=${w.publicKey}`);
          if (!res.ok) throw new Error(`HTTP ${res.status.toString()} for ${w.publicKey}`);
          return {
            wallet: w,
            fees: (await res.json()) as {
              accumulatedLamports: string;
              accumulatedSOL: number;
              creatorVaultAddress: string;
            },
          };
        }),
      );

      const walletFees = results
        .filter((r): r is PromiseFulfilledResult<{ wallet: (typeof wallets)[0]; fees: { accumulatedLamports: string; accumulatedSOL: number; creatorVaultAddress: string } }> => r.status === 'fulfilled')
        .map(({ value: { wallet, fees } }) => ({
          walletId: wallet.id,
          publicKey: wallet.publicKey,
          label: wallet.label,
          accumulatedLamports: fees.accumulatedLamports,
          accumulatedSOL: fees.accumulatedSOL,
          creatorVaultAddress: fees.creatorVaultAddress,
        }));

      const totalAccumulatedSOL = walletFees.reduce((sum, w) => sum + w.accumulatedSOL, 0);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              wallets: walletFees,
              totalAccumulatedSOL,
              note:
                totalAccumulatedSOL > 0
                  ? `${totalAccumulatedSOL.toFixed(9)} SOL claimable. Use claim-creator-fees with the relevant creatorAddress.`
                  : 'No pending creator fees across any of your wallets.',
            }),
          },
        ],
      };
    },
  );

  // -- list-wallets ---------------------------------------------------------

  server.tool(
    'list-wallets',
    `List all wallets belonging to the authenticated user, including their public keys, labels, and derivation index. Use get-wallet-balance for live SOL and token balances. ${DISCLAIMER}`,
    {}, // No parameters -- returns all wallets for the authenticated user
    () => {
      const wallets = userContext.wallets.map((w) => ({
        walletId: w.id,
        publicKey: w.publicKey,
        label: w.label,
        walletIndex: w.index,
        solBalance: w.solBalance ?? null,
      }));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(wallets) }],
      };
    },
  );

  // -- get-token-quote ------------------------------------------------------
  //
  // Price quote without submitting a transaction.
  // GET /api/tokens/:mint/quote?action=buy&solAmount=<n>   (buy)
  // GET /api/tokens/:mint/quote?action=sell&tokenAmount=<n> (sell)

  server.tool(
    'get-token-quote',
    [
      'Get a price quote for buying or selling a PumpFun token without submitting a transaction.',
      'For buy: set action="buy" and solAmount (SOL to spend in lamports) -> returns expectedTokens.',
      'For sell: set action="sell" and tokenAmount (raw base units, from get-token-holdings) -> returns expectedSol.',
      'Also returns route (bonding_curve or pumpswap), priceImpact %, and fee in basis points.',
      'Use this before buy-token or sell-token to preview the trade.',
      DISCLAIMER,
    ].join(' '),
    {
      mint: z.string().describe('Token mint address (base58)'),
      action: z.enum(['buy', 'sell']).describe('"buy" to quote a purchase, "sell" to quote a sale'),
      solAmount: z
        .string()
        .regex(/^\d+$/, 'Must be a decimal integer string')
        .optional()
        .describe(
          'SOL to spend on a buy in lamports (decimal string, e.g. "100000000" = 0.1 SOL). Required when action="buy".',
        ),
      tokenAmount: z
        .string()
        .regex(/^\d+$/, 'Must be a decimal integer string')
        .optional()
        .describe(
          'Raw token base units to sell as a decimal string (same as the "amount" field from get-token-holdings, e.g. "435541983646"). Required when action="sell".',
        ),
    },
    async ({ mint, action, solAmount, tokenAmount }) => {
      // Validate the right param is supplied for the action
      if (action === 'buy' && solAmount === undefined) {
        return agentError(
          'MISSING_PARAM',
          'solAmount is required when action="buy".',
          'Set solAmount to the SOL you want to spend in lamports (e.g. "100000000" = 0.1 SOL).',
        );
      }
      if (action === 'sell' && tokenAmount === undefined) {
        return agentError(
          'MISSING_PARAM',
          'tokenAmount is required when action="sell".',
          'Set tokenAmount to the raw base-unit string from get-token-holdings (e.g. "435541983646").',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const params = new URLSearchParams({ action });
        if (action === 'buy') {
          params.set('solAmount', solAmount as string);
        } else {
          params.set('tokenAmount', tokenAmount as string);
        }
        const res = await api.get(`/api/tokens/${mint}/quote?${params.toString()}`);

        if (!res.ok) {
          const text = await res.text();
          return agentError(
            'QUOTE_FAILED',
            `Quote failed (HTTP ${res.status.toString()}): ${text}`,
            'Verify the mint address is correct and try again.',
          );
        }

        const data: unknown = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Quote request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // -- get-jito-tip-levels --------------------------------------------------
  //
  // Returns current Jito MEV tip amounts in lamports for each priority level.
  // GET /api/jito/tip (public, no auth required, served from Redis cache)

  server.tool(
    'get-jito-tip-levels',
    [
      'Get current Jito MEV bundle tip amounts in lamports for each priority level (economy, normal, fast, turbo).',
      'Values are refreshed every 20 seconds from the Jito tip percentile API.',
      'Use this to pick an appropriate tipLamports for bundle-buy or to understand current MEV costs.',
      DISCLAIMER,
    ].join(' '),
    {}, // No parameters -- public market data
    async () => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get('/api/jito/tip');

        if (!res.ok) {
          const text = await res.text();
          return agentError(
            'API_ERROR',
            `Failed to fetch Jito tip levels (HTTP ${res.status.toString()}): ${text}`,
            'Try again in a few seconds.',
          );
        }

        const data: unknown = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Jito tip levels request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );
}
