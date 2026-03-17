import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const stopLossRemoveAction: Action = {
  name: 'OPENPUMP_STOP_LOSS_REMOVE',
  similes: [
    'remove stop loss on openpump',
    'delete stop loss monitor',
    'openpump cancel stop loss',
    'disable stop loss',
    'remove price protection',
  ],
  description:
    'Remove a stop-loss monitor. ' +
    'The token will no longer be monitored for price drops.',
  examples: [
    [
      {
        input: {
          stopLossId: 'stoploss-uuid-789',
        },
        output: {
          status: 'success',
          data: {
            stopLossId: 'stoploss-uuid-789',
            removed: true,
          },
        },
        explanation: 'Remove an existing stop-loss monitor.',
      },
    ],
  ],
  schema: z.object({
    stopLossId: z.string().describe('ID of the stop-loss to remove'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    return callApi(
      client,
      'DELETE',
      `/api/stop-losses/${input['stopLossId'] as string}`,
    );
  },
};
