/**
 * OPENPUMP_SELL_TOKEN action — Sell a PumpFun token back to SOL.
 *
 * Calls POST /api/tokens/:mint/sell on the OpenPump REST API.
 * Use tokenAmount: "all" to sell the entire balance.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const sellTokenAction: Action = {
  name: 'OPENPUMP_SELL_TOKEN',
  similes: ['SELL_TOKEN', 'DUMP_TOKEN', 'SWAP_TOKEN_FOR_SOL', 'SELL_PUMPFUN'],
  description:
    'Sell a PumpFun token back to SOL from an OpenPump managed wallet. ' +
    'Use tokenAmount: "all" to sell the entire balance.',

  examples: [
    [
      { name: 'user', content: { text: 'Sell all of token XYZ from wallet-2' } },
      { name: 'agent', content: { text: 'Selling entire balance of token XYZ from wallet-2...' } },
    ],
    [
      { name: 'user', content: { text: 'Dump 50% of that token we just bought' } },
      { name: 'agent', content: { text: 'Selling half of your token position...' } },
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
      const tokenAmount = (content['tokenAmount'] as string | undefined) ?? 'all';
      const slippageBps = content['slippageBps'] as number | undefined;
      const priorityLevel = (content['priorityLevel'] as string | undefined) ?? 'normal';

      if (!walletId || !mint) {
        if (callback) {
          await callback({
            text: 'I need the wallet ID and token mint address to execute a sell. Could you provide those?',
            actions: ['OPENPUMP_SELL_TOKEN'],
          });
        }
        return { success: false, error: 'Missing required parameters: walletId, mint' };
      }

      const body: Record<string, unknown> = { walletId, tokenAmount, priorityLevel };
      if (slippageBps !== undefined) body['slippageBps'] = slippageBps;

      const res = await client.post(`/api/tokens/${mint}/sell`, body);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Sell failed (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_SELL_TOKEN'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const sig = typeof data['signature'] === 'string' ? data['signature'] : 'pending';
      const successMsg =
        `Sell order executed successfully.\n` +
        `Token: ${mint}\n` +
        `Amount: ${tokenAmount === 'all' ? 'entire balance' : tokenAmount}\n` +
        `Signature: ${sig}`;

      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_SELL_TOKEN'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Sell request failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_SELL_TOKEN'] });
      return { success: false, error: errMsg };
    }
  },
};
