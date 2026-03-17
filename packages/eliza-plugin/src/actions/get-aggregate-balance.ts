/**
 * OPENPUMP_GET_AGGREGATE_BALANCE action — Get total SOL balance across all wallets.
 *
 * Calls GET /api/wallets/aggregate-balance on the OpenPump REST API.
 * Read-only operation — returns combined SOL balance and wallet count.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const getAggregateBalanceAction: Action = {
  name: 'OPENPUMP_GET_AGGREGATE_BALANCE',
  similes: ['AGGREGATE_BALANCE', 'TOTAL_BALANCE', 'ALL_WALLETS_BALANCE', 'PORTFOLIO_BALANCE'],
  description:
    'Get the total SOL balance across all managed wallets. ' +
    'Returns total SOL, total lamports, and wallet count. ' +
    'Use this to quickly check overall funds before operations.',

  examples: [
    [
      { name: 'user', content: { text: 'How much total SOL do I have across all wallets?' } },
      { name: 'agent', content: { text: 'Fetching aggregate balance across all wallets...' } },
    ],
    [
      { name: 'user', content: { text: 'Show me my total portfolio balance' } },
      { name: 'agent', content: { text: 'Calculating total SOL across all managed wallets...' } },
    ],
  ],

  validate: (runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<boolean> => {
    const apiKey = runtime.getSetting('OPENPUMP_API_KEY');
    return Promise.resolve(typeof apiKey === 'string' && apiKey.length > 0);
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    try {
      const client = getClient(runtime);
      const res = await client.get('/api/wallets/aggregate-balance');

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Failed to fetch aggregate balance (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_GET_AGGREGATE_BALANCE'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as {
        data: { totalSol: string; totalLamports: string; walletCount: number };
      };

      const result = data.data;
      const successMsg =
        `Aggregate Balance:\n` +
        `  Total SOL: ${result.totalSol}\n` +
        `  Wallets: ${String(result.walletCount)}`;

      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_GET_AGGREGATE_BALANCE'] });
      return { success: true, text: successMsg, data: result };
    } catch (error) {
      const errMsg = `Aggregate balance fetch failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_GET_AGGREGATE_BALANCE'] });
      return { success: false, error: errMsg };
    }
  },
};
