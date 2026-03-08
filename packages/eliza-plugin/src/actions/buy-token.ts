/**
 * OPENPUMP_BUY_TOKEN action — Buy a PumpFun token with SOL.
 *
 * Calls POST /api/tokens/:mint/buy on the OpenPump REST API.
 * Server-side signing — no local keypair needed.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const buyTokenAction: Action = {
  name: 'OPENPUMP_BUY_TOKEN',
  similes: ['BUY_TOKEN', 'PURCHASE_TOKEN', 'SWAP_SOL_FOR_TOKEN', 'BUY_PUMPFUN'],
  description:
    'Buy a PumpFun token with SOL from an OpenPump managed wallet. ' +
    'Requires wallet ID, token mint address, and SOL amount in lamports. ' +
    'Uses server-side signing (no local keypair needed).',

  examples: [
    [
      { name: 'user', content: { text: 'Buy 0.5 SOL of token ABC123mint from wallet-1' } },
      { name: 'agent', content: { text: 'Executing buy order for 0.5 SOL of token ABC123mint from wallet-1...' } },
    ],
    [
      { name: 'user', content: { text: 'Use my sniper wallet to buy 0.1 SOL of that new token' } },
      { name: 'agent', content: { text: 'Buying 0.1 SOL worth of tokens using your sniper wallet...' } },
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

      // Extract parameters from message content (populated by LLM runtime)
      const content = message.content as Record<string, unknown>;
      const walletId = content['walletId'] as string | undefined;
      const mint = content['mint'] as string | undefined;
      const amountLamports = content['amountLamports'] as string | undefined;
      const slippageBps = content['slippageBps'] as number | undefined;
      const priorityLevel = (content['priorityLevel'] as string | undefined) ?? 'normal';

      if (!walletId || !mint || !amountLamports) {
        if (callback) {
          await callback({
            text: 'I need the wallet ID, token mint address, and SOL amount in lamports to execute a buy. Could you provide those details?',
            actions: ['OPENPUMP_BUY_TOKEN'],
          });
        }
        return { success: false, error: 'Missing required parameters: walletId, mint, amountLamports' };
      }

      const body: Record<string, unknown> = {
        walletId,
        amountLamports,
        priorityLevel,
      };
      if (slippageBps !== undefined) body['slippageBps'] = slippageBps;

      const res = await client.post(`/api/tokens/${mint}/buy`, body);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Buy failed (HTTP ${String(res.status)}): ${errText}`;
        if (callback) {
          await callback({ text: errorMsg, actions: ['OPENPUMP_BUY_TOKEN'] });
        }
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const solAmount = (Number(amountLamports) / 1_000_000_000).toFixed(4);
      const sig = typeof data['signature'] === 'string' ? data['signature'] : 'pending';
      const successMsg =
        `Buy order executed successfully.\n` +
        `Spent: ${solAmount} SOL\n` +
        `Token: ${mint}\n` +
        `Signature: ${sig}`;

      if (callback) {
        await callback({ text: successMsg, actions: ['OPENPUMP_BUY_TOKEN'] });
      }

      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Buy request failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) {
        await callback({ text: errMsg, actions: ['OPENPUMP_BUY_TOKEN'] });
      }
      return { success: false, error: errMsg };
    }
  },
};
