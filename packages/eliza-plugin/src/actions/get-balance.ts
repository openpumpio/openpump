/**
 * OPENPUMP_GET_BALANCE action — Get SOL and token balances for a wallet.
 *
 * Calls GET /api/wallets/:id/balance on the OpenPump REST API.
 * Read-only operation — returns real-time on-chain data.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const getBalanceAction: Action = {
  name: 'OPENPUMP_GET_BALANCE',
  similes: ['GET_BALANCE', 'CHECK_BALANCE', 'WALLET_BALANCE', 'SOL_BALANCE'],
  description:
    'Get the SOL balance and all token balances held by the specified OpenPump wallet. ' +
    'Returns real-time on-chain data.',

  examples: [
    [
      { name: 'user', content: { text: 'Check the balance of wallet-1' } },
      { name: 'agent', content: { text: 'Fetching balance for wallet-1...' } },
    ],
    [
      { name: 'user', content: { text: 'How much SOL is in my sniper wallet?' } },
      { name: 'agent', content: { text: 'Looking up your sniper wallet balance...' } },
    ],
  ],

  validate: (runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<boolean> => {
    const apiKey = runtime.getSetting('OPENPUMP_API_KEY');
    return Promise.resolve(typeof apiKey === 'string' && apiKey.length > 0);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    try {
      const client = getClient(runtime);
      const content = message.content as Record<string, unknown>;
      const walletId = content['walletId'] as string | undefined;

      if (!walletId) {
        if (callback) {
          await callback({
            text: 'I need the wallet ID to check its balance. Use LIST_WALLETS to see available wallets.',
            actions: ['OPENPUMP_GET_BALANCE'],
          });
        }
        return { success: false, error: 'Missing required parameter: walletId' };
      }

      const res = await client.get(`/api/wallets/${walletId}/balance`);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = res.status === 404
          ? `Wallet "${walletId}" not found. Use LIST_WALLETS to see available wallet IDs.`
          : `Failed to fetch balance (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_GET_BALANCE'] });
        return { success: false, error: errorMsg };
      }

      const body = (await res.json()) as {
        data: {
          solBalance: string;
          lamports: string;
          tokenBalances: Array<{ mint: string; amount: string; uiAmount: number | null; decimals: number }>;
        };
      };
      const data = body.data;

      const lines: string[] = [`Wallet ${walletId} Balance:`];
      lines.push(`  SOL: ${data.solBalance}`);

      const tokenPositions = data.tokenBalances.filter(
        (tb) => tb.uiAmount === null ? tb.amount !== '0' : tb.uiAmount > 0,
      );

      if (tokenPositions.length > 0) {
        lines.push(`  Token Positions (${String(tokenPositions.length)}):`);
        for (const tb of tokenPositions) {
          lines.push(`    - ${tb.mint}: ${String(tb.uiAmount ?? tb.amount)}`);
        }
      } else {
        lines.push('  No token positions');
      }

      const successMsg = lines.join('\n');
      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_GET_BALANCE'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Balance fetch failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_GET_BALANCE'] });
      return { success: false, error: errMsg };
    }
  },
};
