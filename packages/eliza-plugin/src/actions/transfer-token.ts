/**
 * OPENPUMP_TRANSFER_TOKEN action — Send SPL tokens from a managed wallet to any Solana address.
 *
 * Calls POST /api/wallets/:fromWalletId/transfer on the OpenPump REST API.
 * Use tokenAmount: "all" to transfer the entire balance.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const transferTokenAction: Action = {
  name: 'OPENPUMP_TRANSFER_TOKEN',
  similes: ['TRANSFER_TOKEN', 'SEND_TOKEN', 'MOVE_TOKEN', 'WITHDRAW_TOKEN'],
  description:
    'Send SPL tokens from an OpenPump managed wallet to any Solana address. ' +
    'Use tokenAmount: "all" to send the entire balance. ' +
    'If the destination lacks a token account, one is created automatically.',

  examples: [
    [
      { name: 'user', content: { text: 'Send all of token ABC from wallet-1 to address XYZ' } },
      { name: 'agent', content: { text: 'Transferring all tokens from wallet-1 to XYZ...' } },
    ],
    [
      { name: 'user', content: { text: 'Move 1000000 tokens of mint DEF to my Phantom wallet' } },
      { name: 'agent', content: { text: 'Sending tokens to your external address...' } },
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
      const fromWalletId = content['fromWalletId'] as string | undefined;
      const toAddress = content['toAddress'] as string | undefined;
      const mint = content['mint'] as string | undefined;
      const tokenAmount = (content['tokenAmount'] as string | undefined) ?? 'all';

      if (!fromWalletId || !toAddress || !mint) {
        if (callback) {
          await callback({
            text: 'I need the source wallet ID, destination address, and token mint address to transfer tokens.',
            actions: ['OPENPUMP_TRANSFER_TOKEN'],
          });
        }
        return { success: false, error: 'Missing required parameters: fromWalletId, toAddress, mint' };
      }

      const body: Record<string, unknown> = {
        toAddress,
        mint,
        tokenAmount,
      };

      const res = await client.post(`/api/wallets/${fromWalletId}/transfer`, body);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Token transfer failed (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_TRANSFER_TOKEN'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const sig = typeof data['signature'] === 'string' ? data['signature'] : 'pending';
      const successMsg =
        `Token transfer executed successfully.\n` +
        `Token: ${mint}\n` +
        `Amount: ${tokenAmount === 'all' ? 'entire balance' : tokenAmount}\n` +
        `From: ${fromWalletId}\n` +
        `To: ${toAddress}\n` +
        `Signature: ${sig}`;

      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_TRANSFER_TOKEN'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Token transfer failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_TRANSFER_TOKEN'] });
      return { success: false, error: errMsg };
    }
  },
};
