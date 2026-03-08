/**
 * OPENPUMP_SELL_ALL action — Sell a token from all wallets that hold it.
 *
 * Iterates through all managed wallets, checks holdings, then calls
 * POST /api/tokens/:mint/sell for each wallet holding the token.
 * Useful for exiting all positions in a single conversational command.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const sellAllAction: Action = {
  name: 'OPENPUMP_SELL_ALL',
  similes: ['SELL_ALL', 'EXIT_ALL_POSITIONS', 'DUMP_ALL', 'SELL_EVERYTHING'],
  description:
    'Sell a token from ALL wallets that hold it. Iterates through your managed wallets, ' +
    'finds those holding the specified token, and sells the entire balance from each. ' +
    'Returns results per wallet.',

  examples: [
    [
      { name: 'user', content: { text: 'Sell all positions in token XYZ across all wallets' } },
      { name: 'agent', content: { text: 'Selling token XYZ from all wallets that hold it...' } },
    ],
    [
      { name: 'user', content: { text: 'Exit all my positions in that token' } },
      { name: 'agent', content: { text: 'Finding all wallets holding the token and selling...' } },
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
      const mint = content['mint'] as string | undefined;

      if (!mint) {
        if (callback) {
          await callback({
            text: 'I need the token mint address to sell all positions. Could you provide it?',
            actions: ['OPENPUMP_SELL_ALL'],
          });
        }
        return { success: false, error: 'Missing required parameter: mint' };
      }

      // Step 1: Get all wallets
      const walletsRes = await client.get('/api/wallets');
      if (!walletsRes.ok) {
        const errMsg = `Failed to fetch wallets: HTTP ${String(walletsRes.status)}`;
        if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_SELL_ALL'] });
        return { success: false, error: errMsg };
      }
      const walletsBody = (await walletsRes.json()) as {
        data: Array<{ id: string; publicKey: string; label: string | null }>;
      };
      const wallets = walletsBody.data ?? [];

      if (wallets.length === 0) {
        const msg = 'No wallets found. Nothing to sell.';
        if (callback) await callback({ text: msg, actions: ['OPENPUMP_SELL_ALL'] });
        return { success: true, text: msg, data: { results: [] } };
      }

      // Step 2: Check balances for each wallet to find holders
      const balanceResults = await Promise.allSettled(
        wallets.map(async (w) => {
          const res = await client.get(`/api/wallets/${w.id}/balance`);
          if (!res.ok) return null;
          const body = (await res.json()) as {
            data: {
              tokenBalances: Array<{ mint: string; amount: string; uiAmount: number | null }>;
            };
          };
          const holding = body.data.tokenBalances.find((tb) => tb.mint === mint);
          if (!holding) return null;
          const hasBalance = holding.uiAmount === null ? holding.amount !== '0' : holding.uiAmount > 0;
          if (!hasBalance) return null;
          return { walletId: w.id, label: w.label, amount: holding.amount };
        }),
      );

      const holders = balanceResults
        .filter((r): r is PromiseFulfilledResult<{ walletId: string; label: string | null; amount: string } | null> =>
          r.status === 'fulfilled',
        )
        .map((r) => r.value)
        .filter((v): v is { walletId: string; label: string | null; amount: string } => v !== null);

      if (holders.length === 0) {
        const msg = `No wallets hold token ${mint}. Nothing to sell.`;
        if (callback) await callback({ text: msg, actions: ['OPENPUMP_SELL_ALL'] });
        return { success: true, text: msg, data: { results: [] } };
      }

      // Step 3: Execute sell for each holder
      const sellResults: Array<{ walletId: string; success: boolean; signature?: string; error?: string }> = [];

      for (const holder of holders) {
        try {
          const sellRes = await client.post(`/api/tokens/${mint}/sell`, {
            walletId: holder.walletId,
            tokenAmount: 'all',
            priorityLevel: 'normal',
          });

          if (sellRes.ok) {
            const sellData = (await sellRes.json()) as Record<string, unknown>;
            const sig = typeof sellData['signature'] === 'string' ? sellData['signature'] : 'pending';
            sellResults.push({
              walletId: holder.walletId,
              success: true,
              signature: sig,
            });
          } else {
            const errText = await sellRes.text();
            sellResults.push({
              walletId: holder.walletId,
              success: false,
              error: `HTTP ${String(sellRes.status)}: ${errText}`,
            });
          }
        } catch (error) {
          sellResults.push({
            walletId: holder.walletId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const successCount = sellResults.filter((r) => r.success).length;
      const failCount = sellResults.length - successCount;

      const lines: string[] = [`Sell-all results for token ${mint}:`];
      for (const r of sellResults) {
        if (r.success) {
          lines.push(`  ${r.walletId}: SOLD (sig: ${r.signature ?? 'pending'})`);
        } else {
          lines.push(`  ${r.walletId}: FAILED (${r.error ?? 'unknown error'})`);
        }
      }
      lines.push(`Summary: ${String(successCount)} succeeded, ${String(failCount)} failed`);

      const successMsg = lines.join('\n');
      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_SELL_ALL'] });
      return { success: failCount === 0, text: successMsg, data: { results: sellResults } };
    } catch (error) {
      const errMsg = `Sell-all failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_SELL_ALL'] });
      return { success: false, error: errMsg };
    }
  },
};
