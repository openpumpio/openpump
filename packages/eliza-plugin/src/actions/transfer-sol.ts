/**
 * OPENPUMP_TRANSFER_SOL action — Send SOL from a managed wallet to any Solana address.
 *
 * Calls POST /api/wallets/:fromWalletId/transfer on the OpenPump REST API.
 * Supports internal wallet-to-wallet and external transfers.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const transferSolAction: Action = {
  name: 'OPENPUMP_TRANSFER_SOL',
  similes: ['TRANSFER_SOL', 'SEND_SOL', 'MOVE_SOL', 'WITHDRAW_SOL'],
  description:
    'Send SOL from an OpenPump managed wallet to any Solana address (internal or external). ' +
    'Requires wallet ID, destination address, and amount in lamports. ' +
    'Maximum transfer: 10 SOL per call.',

  examples: [
    [
      { name: 'user', content: { text: 'Send 0.5 SOL from wallet-1 to address ABC123' } },
      { name: 'agent', content: { text: 'Transferring 0.5 SOL from wallet-1 to ABC123...' } },
    ],
    [
      { name: 'user', content: { text: 'Withdraw 1 SOL from my dev wallet to my Phantom' } },
      { name: 'agent', content: { text: 'Sending 1 SOL to your external address...' } },
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
      const amountLamports = content['amountLamports'] as string | undefined;

      if (!fromWalletId || !toAddress || !amountLamports) {
        if (callback) {
          await callback({
            text: 'I need the source wallet ID, destination address, and amount in lamports to transfer SOL.',
            actions: ['OPENPUMP_TRANSFER_SOL'],
          });
        }
        return { success: false, error: 'Missing required parameters: fromWalletId, toAddress, amountLamports' };
      }

      const body: Record<string, unknown> = {
        toAddress,
        amountLamports,
      };

      const res = await client.post(`/api/wallets/${fromWalletId}/transfer`, body);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `SOL transfer failed (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_TRANSFER_SOL'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const solAmount = (Number(amountLamports) / 1_000_000_000).toFixed(4);
      const sig = typeof data['signature'] === 'string' ? data['signature'] : 'pending';
      const successMsg =
        `SOL transfer executed successfully.\n` +
        `Amount: ${solAmount} SOL\n` +
        `From: ${fromWalletId}\n` +
        `To: ${toAddress}\n` +
        `Signature: ${sig}`;

      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_TRANSFER_SOL'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `SOL transfer failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_TRANSFER_SOL'] });
      return { success: false, error: errMsg };
    }
  },
};
