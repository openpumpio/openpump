import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const snipeListAction: Action = {
  name: 'OPENPUMP_SNIPE_LIST',
  similes: [
    'list snipe monitors on openpump',
    'show all snipe monitors',
    'openpump snipe monitors',
    'get sniping bots',
    'view snipe monitors',
  ],
  description:
    'List all snipe monitors for the authenticated user. ' +
    'Optionally filter by status (active, paused, stopped).',
  examples: [
    [
      {
        input: {},
        output: {
          status: 'success',
          data: [
            {
              monitorId: 'monitor-uuid-456',
              tickerPattern: 'PEPE*',
              status: 'active',
              buyCount: 3,
            },
          ],
        },
        explanation: 'List all snipe monitors.',
      },
    ],
  ],
  schema: z.object({
    status: z
      .enum(['active', 'paused', 'stopped'])
      .optional()
      .describe('Filter by monitor status. Omit to return all monitors.'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    let path = '/api/snipe-monitors/monitors';
    if (input['status'] !== undefined) {
      path += `?status=${input['status'] as string}`;
    }
    return callApi(client, 'GET', path);
  },
};
