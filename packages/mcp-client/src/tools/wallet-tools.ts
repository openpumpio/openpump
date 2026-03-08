/**
 * Wallet management tools for the OpenPump MCP server.
 *
 * - create-wallet:              Create a new HD-derived custodial wallet
 * - get-aggregate-balance:      Sum SOL across all user wallets
 * - get-wallet-deposit-address: Get deposit address and funding instructions for a wallet
 * - get-wallet-transactions:    Paginated transfer history for a wallet
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { UserContext } from '../lib/context.js';
import { createApiClient } from '../lib/api-client.js';

const DISCLAIMER = 'Not available to US persons. Use at own risk.';

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

export function registerWalletTools(server: McpServer, userContext: UserContext, apiBaseUrl: string): void {
  // -- create-wallet --------------------------------------------------------

  server.tool(
    'create-wallet',
    [
      'Create a new HD-derived custodial wallet for this account.',
      'The wallet is generated from the account master seed using BIP44 derivation (Phantom-compatible).',
      'Returns the new wallet ID, public key, and derivation index.',
      'Use list-wallets after creation to see the updated wallet list.',
      DISCLAIMER,
    ].join(' '),
    {
      label: z
        .string()
        .max(100)
        .optional()
        .describe('Optional human-readable label for the wallet (e.g. "sniper-1", "launch-wallet").'),
    },
    async ({ label }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const body: Record<string, unknown> = {};
        if (label !== undefined) body['label'] = label;

        const res = await api.post('/api/wallets', body);

        if (!res.ok) {
          const text = await res.text();
          return agentError(
            'CREATE_WALLET_FAILED',
            `Failed to create wallet (HTTP ${res.status.toString()}): ${text}`,
            'Try again in a few seconds.',
          );
        }

        const data = (await res.json()) as { data?: { id?: string; publicKey?: string; walletIndex?: number; label?: string | null } };
        // Keep the in-session wallet list in sync so subsequent tools can find the new wallet
        if (data?.data?.id && data.data.publicKey !== undefined) {
          userContext.wallets.push({
            id: data.data.id,
            publicKey: data.data.publicKey,
            label: data.data.label ?? null,
            index: data.data.walletIndex ?? userContext.wallets.length,
          });
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Create wallet request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // -- get-aggregate-balance ------------------------------------------------

  server.tool(
    'get-aggregate-balance',
    [
      'Get the total SOL balance across all wallets in this account.',
      'Returns totalSol, totalLamports, and walletCount.',
      'Use this to quickly check how much SOL is available across all wallets before a bundle buy or large operation.',
      DISCLAIMER,
    ].join(' '),
    {}, // No parameters -- aggregates all wallets for the authenticated user
    async () => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get('/api/wallets/aggregate-balance');

        if (!res.ok) {
          const text = await res.text();
          return agentError(
            'API_ERROR',
            `Failed to fetch aggregate balance (HTTP ${res.status.toString()}): ${text}`,
            'Try again in a few seconds.',
          );
        }

        const data: unknown = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Aggregate balance request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // -- get-wallet-deposit-address -------------------------------------------

  server.tool(
    'get-wallet-deposit-address',
    [
      'Get the deposit address and funding instructions for a custodial wallet.',
      'Returns the public key (deposit address), minimum SOL amounts for common operations, and instructions for sending SOL from an external wallet.',
      'Use this when you need to tell the user how to fund a wallet from Phantom, Solflare, or any other external source.',
      DISCLAIMER,
    ].join(' '),
    {
      walletId: z.string().describe('ID of the wallet to get the deposit address for'),
    },
    async ({ walletId }) => {
      const wallet = userContext.wallets.find((w) => w.id === walletId);
      if (!wallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Wallet "${walletId}" not found for this account.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get(`/api/wallets/${walletId}/deposit-instructions`);

        if (!res.ok) {
          const text = await res.text();
          return agentError(
            'API_ERROR',
            `Failed to fetch deposit instructions (HTTP ${res.status.toString()}): ${text}`,
            'Try again in a few seconds.',
          );
        }

        const data: unknown = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Deposit instructions request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );

  // -- get-wallet-transactions ----------------------------------------------

  server.tool(
    'get-wallet-transactions',
    [
      'Get the paginated transfer history for a wallet.',
      'Returns buy, sell, and transfer transactions ordered newest-first.',
      'Use type filter to narrow to a specific transaction type.',
      'Use limit and offset for pagination (max 100 per page).',
      DISCLAIMER,
    ].join(' '),
    {
      walletId: z.string().describe('ID of the wallet to fetch transaction history for'),
      type: z
        .enum(['buy', 'sell', 'transfer'])
        .optional()
        .describe('Filter by transaction type. Omit to return all types.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe('Number of transactions to return (default 50, max 100).'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .default(0)
        .describe('Number of transactions to skip for pagination (default 0).'),
    },
    async ({ walletId, type, limit, offset }) => {
      const wallet = userContext.wallets.find((w) => w.id === walletId);
      if (!wallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Wallet "${walletId}" not found for this account.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString(),
        });
        if (type !== undefined) params.set('type', type);

        const res = await api.get(`/api/wallets/${walletId}/transactions?${params.toString()}`);

        if (!res.ok) {
          const text = await res.text();
          return agentError(
            'API_ERROR',
            `Failed to fetch transactions (HTTP ${res.status.toString()}): ${text}`,
            'Try again in a few seconds.',
          );
        }

        const data: unknown = await res.json();
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Transactions request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );
}
