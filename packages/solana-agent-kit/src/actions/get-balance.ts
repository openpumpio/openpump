import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const getBalanceAction: Action = {
  name: 'OPENPUMP_GET_BALANCE',
  similes: [
    'get openpump wallet balance',
    'check wallet SOL balance',
    'wallet balance openpump',
    'how much SOL in wallet',
    'openpump balance',
  ],
  description:
    'Get the SOL balance and all token balances held by the specified managed wallet. ' +
    'Returns real-time on-chain data including SOL balance and token positions.',
  examples: [
    [
      {
        input: { walletId: 'wallet-uuid-456' },
        output: {
          status: 'success',
          data: {
            solBalance: '2.5',
            lamports: '2500000000',
            tokenBalances: [
              {
                mint: 'TokenMint111111111111111111111111',
                amount: '1000000',
                uiAmount: 1,
                decimals: 6,
              },
            ],
          },
        },
        explanation: 'Get the full balance breakdown for a managed wallet.',
      },
    ],
  ],
  schema: z.object({
    walletId: z.string().describe('ID of the wallet to check balance for'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    return callApi(
      client,
      'GET',
      `/api/wallets/${input['walletId'] as string}/balance`,
    );
  },
};
