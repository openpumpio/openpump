/**
 * OPENPUMP_LIST_WALLETS action — List all managed wallets.
 *
 * Calls GET /api/wallets on the OpenPump REST API.
 * Read-only operation — returns wallet IDs, public keys, and labels.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const listWalletsAction: Action = {
  name: 'OPENPUMP_LIST_WALLETS',
  similes: ['LIST_WALLETS', 'SHOW_WALLETS', 'MY_WALLETS', 'GET_WALLETS'],
  description:
    'List all OpenPump managed wallets for the authenticated user. ' +
    'Returns wallet IDs, public keys, and labels. Use GET_BALANCE for live SOL balances.',

  examples: [
    [
      { name: 'user', content: { text: 'Show me my wallets' } },
      { name: 'agent', content: { text: 'Fetching your OpenPump wallets...' } },
    ],
    [
      { name: 'user', content: { text: 'Which wallets do I have?' } },
      { name: 'agent', content: { text: 'Looking up your managed wallets...' } },
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
      const res = await client.get('/api/wallets');

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Failed to fetch wallets (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_LIST_WALLETS'] });
        return { success: false, error: errorMsg };
      }

      const body = (await res.json()) as {
        data: Array<{ id: string; publicKey: string; label: string | null; walletIndex: number }>;
      };
      const wallets = body.data ?? [];

      if (wallets.length === 0) {
        const msg = 'No wallets found for your account.';
        if (callback) await callback({ text: msg, actions: ['OPENPUMP_LIST_WALLETS'] });
        return { success: true, text: msg, data: { wallets: [] } };
      }

      const lines: string[] = [`You have ${String(wallets.length)} wallet(s):`];
      for (const w of wallets) {
        const label = w.label ? ` "${w.label}"` : '';
        lines.push(`  - ${w.id}${label}: ${w.publicKey}`);
      }

      const successMsg = lines.join('\n');
      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_LIST_WALLETS'] });
      return { success: true, text: successMsg, data: { wallets } };
    } catch (error) {
      const errMsg = `Wallet list failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_LIST_WALLETS'] });
      return { success: false, error: errMsg };
    }
  },
};
