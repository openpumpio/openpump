import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const getAggregateBalanceAction: Action = {
  name: 'OPENPUMP_GET_AGGREGATE_BALANCE',
  similes: [
    'get total balance on openpump',
    'aggregate wallet balance',
    'total SOL across all wallets',
    'openpump total balance',
    'check all wallet balances',
  ],
  description:
    'Get the total SOL balance across all wallets in the account. ' +
    'Returns totalSol, totalLamports, and walletCount. ' +
    'Use this to quickly check how much SOL is available before a large operation.',
  examples: [
    [
      {
        input: {},
        output: {
          status: 'success',
          data: {
            totalSol: '5.25',
            totalLamports: '5250000000',
            walletCount: 10,
          },
        },
        explanation: 'Get the total SOL balance across all managed wallets.',
      },
    ],
  ],
  schema: z.object({}),
  handler: async (agent: SolanaAgentKit, _input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    return callApi(client, 'GET', '/api/wallets/aggregate-balance');
  },
};
