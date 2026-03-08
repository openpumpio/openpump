import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const createWalletAction: Action = {
  name: 'OPENPUMP_CREATE_WALLET',
  similes: [
    'create openpump wallet',
    'new managed wallet',
    'add wallet to openpump',
    'openpump new wallet',
    'generate wallet',
  ],
  description:
    'Create a new HD-derived managed wallet for the OpenPump account. ' +
    'The wallet is generated from the account master seed using BIP44 derivation. ' +
    'Returns the new wallet ID, public key, and derivation index.',
  examples: [
    [
      {
        input: { label: 'sniper-2' },
        output: {
          status: 'success',
          data: {
            id: 'uuid-new',
            publicKey: 'NewPubKey123...xyz',
            walletIndex: 3,
            label: 'sniper-2',
          },
        },
        explanation: 'Create a new managed wallet with the label "sniper-2".',
      },
    ],
  ],
  schema: z.object({
    label: z
      .string()
      .max(100)
      .optional()
      .describe(
        'Optional human-readable label for the wallet (e.g. "sniper-1", "launch-wallet")',
      ),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    const body: Record<string, unknown> = {};
    if (input['label'] !== undefined) body['label'] = input['label'];

    return callApi(client, 'POST', '/api/wallets', body);
  },
};
