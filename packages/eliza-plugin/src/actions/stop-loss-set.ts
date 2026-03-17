/**
 * OPENPUMP_STOP_LOSS_SET action — Create a stop-loss monitor on a token.
 *
 * Calls POST /api/stop-losses on the OpenPump REST API.
 * When market cap drops below the trigger, holdings are sold automatically.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const stopLossSetAction: Action = {
  name: 'OPENPUMP_STOP_LOSS_SET',
  similes: ['STOP_LOSS_SET', 'SET_STOP_LOSS', 'CREATE_STOP_LOSS', 'ADD_STOP_LOSS'],
  description:
    'Create a stop-loss monitor on a token. When market cap drops below the trigger level, ' +
    'the specified percentage of holdings is sold automatically. ' +
    'Defaults to selling 100% if sellPercent is not specified.',

  examples: [
    [
      { name: 'user', content: { text: 'Set a stop loss on token ABC at 5 SOL market cap from wallet-1' } },
      { name: 'agent', content: { text: 'Creating stop-loss monitor at 5 SOL market cap...' } },
    ],
    [
      { name: 'user', content: { text: 'Add a stop loss that sells 50% if market cap drops below 10 SOL' } },
      { name: 'agent', content: { text: 'Setting up stop-loss with 50% sell at 10 SOL trigger...' } },
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
      const mint = content['mint'] as string | undefined;
      const triggerMarketCapSol = content['triggerMarketCapSol'] as number | undefined;

      if (!walletId || !mint || triggerMarketCapSol === undefined) {
        if (callback) {
          await callback({
            text: 'I need the wallet ID, token mint address, and trigger market cap (in SOL) to set a stop-loss.',
            actions: ['OPENPUMP_STOP_LOSS_SET'],
          });
        }
        return { success: false, error: 'Missing required parameters: walletId, mint, triggerMarketCapSol' };
      }

      const body: Record<string, unknown> = {
        walletId,
        mint,
        triggerMarketCapSol,
      };

      if (content['sellPercent'] !== undefined) body['sellPercent'] = content['sellPercent'];
      if (content['slippageBps'] !== undefined) body['slippageBps'] = content['slippageBps'];
      if (content['priorityLevel']) body['priorityLevel'] = content['priorityLevel'];

      const res = await client.post('/api/stop-losses', body);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Failed to set stop-loss (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_STOP_LOSS_SET'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const stopLossId = typeof data['stopLossId'] === 'string' ? data['stopLossId'] : String(data['stopLossId'] ?? 'unknown');
      const sellPct = content['sellPercent'] !== undefined ? String(content['sellPercent']) : '100';
      const successMsg =
        `Stop-loss monitor created.\n` +
        `Stop-Loss ID: ${stopLossId}\n` +
        `Token: ${mint}\n` +
        `Trigger: ${String(triggerMarketCapSol)} SOL market cap\n` +
        `Sell: ${sellPct}%\n` +
        `Wallet: ${walletId}`;

      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_STOP_LOSS_SET'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Failed to set stop-loss: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_STOP_LOSS_SET'] });
      return { success: false, error: errMsg };
    }
  },
};
