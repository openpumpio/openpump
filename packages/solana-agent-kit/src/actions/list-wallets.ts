import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const listWalletsAction: Action = {
  name: 'OPENPUMP_LIST_WALLETS',
  similes: [
    'list openpump wallets',
    'show my managed wallets',
    'get wallet list',
    'openpump wallets',
    'view all wallets',
  ],
  description:
    'List all managed wallets belonging to the authenticated OpenPump account. ' +
    'Returns wallet IDs, public keys, labels, and SOL balances. ' +
    'Use this to find wallet IDs for buy/sell/create operations.',
  examples: [
    [
      {
        input: {},
        output: {
          status: 'success',
          data: [
            {
              walletId: 'uuid-001',
              publicKey: 'Abc123...xyz',
              label: 'sniper-1',
              solBalance: '1.5',
            },
          ],
        },
        explanation: 'List all managed wallets for the account.',
      },
    ],
  ],
  schema: z.object({}),
  handler: async (agent: SolanaAgentKit, _input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    return callApi(client, 'GET', '/api/wallets');
  },
};
