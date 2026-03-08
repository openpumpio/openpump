/**
 * Transfer tools for the OpenPump MCP server.
 *
 * - transfer-sol:   Send SOL from a custodial wallet to any Solana address
 * - transfer-token: Send SPL tokens from a custodial wallet to any Solana address
 *
 * Both tools call POST /wallets/:id/transfer on the REST API synchronously.
 * The API handles KMS signing and waits for on-chain confirmation before returning.
 *
 * Safety gates:
 * - confirm: true required to execute (skipped for dryRun)
 * - dryRun: true validates inputs and estimates fees without submitting
 * - Hard cap: 10 SOL per transfer-sol call
 * - Rent-exempt pre-flight: warns when sender SOL balance would drop below 0.001 SOL
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { UserContext } from '../lib/context.js';
import { createApiClient } from '../lib/api-client.js';

const DISCLAIMER = 'Not available to US persons. Use at own risk.';

const LAMPORTS_PER_SOL = 1_000_000_000;
const TRANSFER_CAP_LAMPORTS = 10_000_000_000n; // 10 SOL
const RENT_EXEMPT_MINIMUM_LAMPORTS = 1_000_000n; // 0.001 SOL
const NETWORK_FEE_PER_TX_LAMPORTS = 5000n; // ~5000 lamports
const TOKEN_ACCOUNT_RENT_LAMPORTS = 2_049_280n; // 0.00204928 SOL

const TRANSFER_ANNOTATIONS = {
  destructiveHint: true,
  idempotentHint: false,
  readOnlyHint: false,
  openWorldHint: true,
} as const;

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
      code: parsed.code ?? parsed.error ?? 'TRANSFER_FAILED',
      message: parsed.message ?? text,
    };
  } catch {
    return { code: 'TRANSFER_FAILED', message: text };
  }
}

export function registerTransferTools(server: McpServer, userContext: UserContext, apiBaseUrl: string): void {
  // -- transfer-sol ---------------------------------------------------------

  server.tool(
    'transfer-sol',
    [
      'Send SOL from a custodial wallet to any Solana address (internal or external).',
      'Use get-wallet-balance before calling to verify sufficient balance.',
      'Sender balance after transfer must remain above 0.001 SOL (Solana rent-exempt minimum).',
      `Maximum transfer: ${TRANSFER_CAP_LAMPORTS.toString()} lamports (10 SOL) per call.`,
      'Use dryRun: true to validate and estimate fees without submitting.',
      'Requires confirm: true to execute.',
      DISCLAIMER,
    ].join(' '),
    {
      fromWalletId: z.string().describe('ID of the source wallet (from list-wallets)'),
      toAddress: z
        .string()
        .describe(
          'Destination Solana address (base58). Accepts any valid address -- internal wallet public keys or external addresses.',
        ),
      amountSol: z
        .string()
        .regex(/^\d+$/, 'Must be a decimal integer string')
        .describe(
          `Amount of SOL to send in lamports (decimal string, e.g. "500000000" = 0.5 SOL). Maximum ${TRANSFER_CAP_LAMPORTS.toString()} lamports (10 SOL) per call.`,
        ),
      memo: z
        .string()
        .max(256)
        .optional()
        .describe('Optional on-chain memo attached to the transaction (max 256 chars).'),
      priorityFeeMicroLamports: z
        .number()
        .int()
        .min(0)
        .max(1_000_000)
        .optional()
        .describe('Priority fee in micro-lamports per compute unit. Omit to use the API default.'),
      dryRun: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, validates inputs and estimates fees without submitting. confirm is not required.'),
      confirm: z
        .boolean()
        .describe(
          'REQUIRED: Must be true to execute. Run with dryRun: true first to preview the transfer.',
        ),
    },
    TRANSFER_ANNOTATIONS,
    async ({ fromWalletId, toAddress, amountSol, memo, priorityFeeMicroLamports, dryRun, confirm }) => {
      // Validate source wallet exists in userContext
      const fromWallet = userContext.wallets.find((w) => w.id === fromWalletId);
      if (!fromWallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Source wallet "${fromWalletId}" not found for this account.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      // Self-transfer guard
      if (fromWallet.publicKey === toAddress) {
        return agentError(
          'INVALID_INPUT',
          'Cannot transfer SOL to the same wallet (fromWalletId and toAddress resolve to the same public key).',
          'Provide a different destination address.',
        );
      }

      const amountLamports = BigInt(amountSol);

      // Hard cap: 10 SOL per call
      if (amountLamports > TRANSFER_CAP_LAMPORTS) {
        return agentError(
          'INVALID_INPUT',
          `amountSol (${amountLamports.toString()} lamports) exceeds maximum of ${TRANSFER_CAP_LAMPORTS.toString()} lamports (10 SOL) per call.`,
          'Split into multiple smaller transfers.',
        );
      }

      // Rent-exempt pre-flight (only when solBalance is available in context)
      if (fromWallet.solBalance !== undefined) {
        const balanceLamports = BigInt(Math.round(fromWallet.solBalance * LAMPORTS_PER_SOL));
        const remainingLamports = balanceLamports - amountLamports - NETWORK_FEE_PER_TX_LAMPORTS;
        if (remainingLamports < RENT_EXEMPT_MINIMUM_LAMPORTS) {
          return agentError(
            'INSUFFICIENT_BALANCE',
            `Transfer would leave ${remainingLamports.toString()} lamports in the source wallet, ` +
              `below the Solana rent-exempt minimum of ${RENT_EXEMPT_MINIMUM_LAMPORTS.toString()} lamports. ` +
              `Current balance: ${balanceLamports.toString()} lamports.`,
            'Reduce the transfer amount to keep at least 1000000 lamports (0.001 SOL) in the source wallet.',
          );
        }
      }

      // dryRun -- validate without submitting
      if (dryRun) {
        const balanceLamports =
          fromWallet.solBalance === undefined
            ? null
            : BigInt(Math.round(fromWallet.solBalance * LAMPORTS_PER_SOL));
        const remainingLamports =
          balanceLamports === null
            ? null
            : balanceLamports - amountLamports - NETWORK_FEE_PER_TX_LAMPORTS;
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                dryRun: true,
                valid: true,
                amountLamports: amountLamports.toString(),
                fromAddress: fromWallet.publicKey,
                toAddress,
                estimatedNetworkFeeLamports: NETWORK_FEE_PER_TX_LAMPORTS.toString(),
                remainingLamportsAfterTransfer: remainingLamports?.toString() ?? null,
                rentExemptWarning:
                  remainingLamports !== null && remainingLamports < RENT_EXEMPT_MINIMUM_LAMPORTS,
                message: 'Transfer would succeed. Call again with confirm: true to execute.',
              }),
            },
          ],
        };
      }

      // Confirm gate
      if (!confirm) {
        return agentError(
          'CONFIRMATION_REQUIRED',
          'transfer-sol requires confirm: true to execute.',
          'Run with dryRun: true to preview the transfer, then call again with confirm: true.',
        );
      }

      // Call real API
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const body: Record<string, unknown> = {
          toAddress,
          amountLamports: amountSol, // already a lamports decimal string
        };
        if (memo !== undefined) body['memo'] = memo;
        if (priorityFeeMicroLamports !== undefined)
          body['priorityFeeMicroLamports'] = priorityFeeMicroLamports;

        const res = await api.post(`/api/wallets/${fromWalletId}/transfer`, body);

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(
            code,
            `SOL transfer failed (HTTP ${res.status.toString()}): ${message}`,
            'Verify the destination address is valid and the wallet has sufficient SOL.',
          );
        }

        const data: unknown = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Transfer request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // -- transfer-token -------------------------------------------------------

  server.tool(
    'transfer-token',
    [
      'Send SPL tokens from a custodial wallet to any Solana address (internal or external).',
      'tokenAmount is the raw base-unit amount string (same as the "amount" field from get-token-holdings), or "all" to send the entire balance.',
      'If the destination lacks a token account for this mint, the transaction creates one (~0.002 SOL rent, paid by the sender).',
      'Use dryRun: true to validate and estimate fees without submitting.',
      'Requires confirm: true to execute.',
      DISCLAIMER,
    ].join(' '),
    {
      fromWalletId: z.string().describe('ID of the source wallet holding the token (from list-wallets)'),
      toAddress: z
        .string()
        .describe(
          'Destination Solana address (base58). Accepts any valid address -- internal wallet public keys or external addresses.',
        ),
      mint: z.string().describe('SPL token mint address (base58)'),
      tokenAmount: z
        .union([
          z
            .string()
            .regex(/^\d+$/, 'Must be a non-negative integer string')
            .describe(
              'Raw token base units as a string (same format as get-token-holdings "amount" field, e.g. "1000000" for 1 token with 6 decimals)',
            ),
          z.literal('all'),
        ])
        .describe(
          'Raw token base units as a decimal string, or "all" to transfer the entire balance. ' +
            'Use get-token-holdings to get the raw "amount" string for a specific wallet.',
        ),
      memo: z
        .string()
        .max(256)
        .optional()
        .describe('Optional on-chain memo attached to the transaction (max 256 chars).'),
      priorityFeeMicroLamports: z
        .number()
        .int()
        .min(0)
        .max(1_000_000)
        .optional()
        .describe('Priority fee in micro-lamports per compute unit. Omit to use the API default.'),
      dryRun: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, validates inputs and estimates fees without submitting.'),
      confirm: z.boolean().describe('REQUIRED: Must be true to execute the token transfer.'),
    },
    TRANSFER_ANNOTATIONS,
    async ({
      fromWalletId,
      toAddress,
      mint,
      tokenAmount,
      memo,
      priorityFeeMicroLamports,
      dryRun,
      confirm,
    }) => {
      // Validate source wallet
      const fromWallet = userContext.wallets.find((w) => w.id === fromWalletId);
      if (!fromWallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Source wallet "${fromWalletId}" not found for this account.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      // Self-transfer guard
      if (fromWallet.publicKey === toAddress) {
        return agentError(
          'INVALID_INPUT',
          'Cannot transfer tokens to the same wallet.',
          'Provide a different destination address.',
        );
      }

      const api = createApiClient(userContext.apiKey, apiBaseUrl);

      // Resolve "all" -> fetch actual balance from API
      let resolvedAmountLamports: string;
      if (tokenAmount === 'all') {
        try {
          const balRes = await api.get(`/api/wallets/${fromWalletId}/balance`);
          if (!balRes.ok) {
            return agentError(
              'API_ERROR',
              `Failed to fetch balance to resolve "all" (HTTP ${balRes.status.toString()}).`,
              'Use get-wallet-balance to check holdings, then pass the raw amount string directly.',
            );
          }
          const balData = (await balRes.json()) as {
            data: { tokenBalances: Array<{ mint: string; amount: string }> };
          };
          const entry = balData.data.tokenBalances.find((tb) => tb.mint === mint);
          if (!entry || entry.amount === '0') {
            return agentError(
              'NO_TOKEN_BALANCE',
              `Wallet "${fromWalletId}" holds no balance of token ${mint}.`,
              'Use get-token-holdings to check which wallets hold this token.',
            );
          }
          resolvedAmountLamports = entry.amount;
        } catch (error) {
          return agentError(
            'API_ERROR',
            `Balance fetch failed: ${error instanceof Error ? error.message : String(error)}`,
            'Try again in a few seconds.',
          );
        }
      } else {
        resolvedAmountLamports = tokenAmount;
      }

      // dryRun -- validate without submitting
      if (dryRun) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                dryRun: true,
                valid: true,
                fromAddress: fromWallet.publicKey,
                toAddress,
                mint,
                tokenAmountRaw: resolvedAmountLamports,
                estimatedNetworkFeeLamports: NETWORK_FEE_PER_TX_LAMPORTS.toString(),
                tokenAccountCreationCostLamports: TOKEN_ACCOUNT_RENT_LAMPORTS.toString(),
                message:
                  'Token transfer would proceed. If destination lacks a token account, ~0.002 SOL rent will be deducted from the source wallet. Call again with confirm: true to execute.',
              }),
            },
          ],
        };
      }

      // Confirm gate
      if (!confirm) {
        return agentError(
          'CONFIRMATION_REQUIRED',
          'transfer-token requires confirm: true to execute.',
          'Run with dryRun: true to preview the transfer, then call again with confirm: true.',
        );
      }

      // Call real API
      try {
        const body: Record<string, unknown> = {
          toAddress,
          amountLamports: resolvedAmountLamports,
          mint,
        };
        if (memo !== undefined) body['memo'] = memo;
        if (priorityFeeMicroLamports !== undefined)
          body['priorityFeeMicroLamports'] = priorityFeeMicroLamports;

        const res = await api.post(`/api/wallets/${fromWalletId}/transfer`, body);

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(
            code,
            `Token transfer failed (HTTP ${res.status.toString()}): ${message}`,
            'Verify the destination address is valid and the wallet holds sufficient token balance.',
          );
        }

        const data: unknown = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Transfer request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );
}
