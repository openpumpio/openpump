import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const transferSolAction: Action = {
  name: 'OPENPUMP_TRANSFER_SOL',
  similes: [
    'send SOL on openpump',
    'transfer SOL between wallets',
    'move SOL to address',
    'openpump send SOL',
    'withdraw SOL from wallet',
  ],
  description:
    'Send SOL from a managed wallet to any Solana address (internal or external). ' +
    'Sender balance after transfer must remain above 0.001 SOL (rent-exempt minimum). ' +
    'Maximum transfer: 10 SOL per call. Requires confirm: true to execute.',
  examples: [
    [
      {
        input: {
          fromWalletId: 'wallet-uuid-123',
          toAddress: 'RecipientPubKey111111111111111',
          amountLamports: '500000000',
        },
        output: {
          status: 'success',
          data: {
            signature: '4xYz...abc',
            amountSol: '0.5',
          },
        },
        explanation: 'Transfer 0.5 SOL from the managed wallet to an external address.',
      },
    ],
  ],
  schema: z.object({
    fromWalletId: z.string().describe('ID of the source wallet (from list-wallets)'),
    toAddress: z
      .string()
      .describe('Destination Solana address (base58). Accepts any valid address.'),
    amountLamports: z
      .string()
      .regex(/^\d+$/, 'Must be a decimal integer string')
      .describe(
        'SOL amount to send in lamports as decimal string (e.g. "500000000" = 0.5 SOL). Max 10 SOL.',
      ),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    return callApi(
      client,
      'POST',
      `/api/wallets/${input['fromWalletId'] as string}/transfer`,
      {
        toAddress: input['toAddress'],
        amountLamports: input['amountLamports'],
      },
    );
  },
};
