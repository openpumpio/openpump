import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const stopLossListAction: Action = {
  name: 'OPENPUMP_STOP_LOSS_LIST',
  similes: [
    'list stop losses on openpump',
    'show all stop loss monitors',
    'openpump stop losses',
    'get stop loss monitors',
    'view price protections',
  ],
  description:
    'List all stop-loss monitors for the authenticated user. ' +
    'Optionally filter by status (active, triggered, stopped).',
  examples: [
    [
      {
        input: {},
        output: {
          status: 'success',
          data: [
            {
              stopLossId: 'stoploss-uuid-789',
              mint: 'TokenMint111111111111111111111111',
              triggerMarketCapSol: 5.0,
              status: 'active',
            },
          ],
        },
        explanation: 'List all stop-loss monitors.',
      },
    ],
  ],
  schema: z.object({
    status: z
      .enum(['active', 'triggered', 'stopped'])
      .optional()
      .describe('Filter by stop-loss status. Omit to return all.'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    let path = '/api/stop-losses';
    if (input['status'] !== undefined) {
      path += `?status=${input['status'] as string}`;
    }
    return callApi(client, 'GET', path);
  },
};
