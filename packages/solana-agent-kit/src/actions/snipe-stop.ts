import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const snipeStopAction: Action = {
  name: 'OPENPUMP_SNIPE_STOP',
  similes: [
    'stop sniper on openpump',
    'halt snipe monitor',
    'openpump stop sniping',
    'kill snipe bot',
    'stop auto-buying tokens',
  ],
  description:
    'Stop a snipe monitor permanently. ' +
    'The monitor will no longer match or buy tokens.',
  examples: [
    [
      {
        input: {
          monitorId: 'monitor-uuid-456',
        },
        output: {
          status: 'success',
          data: {
            monitorId: 'monitor-uuid-456',
            status: 'stopped',
          },
        },
        explanation: 'Stop an active snipe monitor.',
      },
    ],
  ],
  schema: z.object({
    monitorId: z.string().describe('ID of the snipe monitor to stop'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    return callApi(
      client,
      'POST',
      `/api/snipe-monitors/monitors/${input['monitorId'] as string}/stop`,
    );
  },
};
