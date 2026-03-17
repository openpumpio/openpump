import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const mmSessionStatusAction: Action = {
  name: 'OPENPUMP_MM_SESSION_STATUS',
  similes: [
    'check market making status on openpump',
    'market making session status',
    'openpump mm status',
    'how is my market maker doing',
    'get mm session details',
  ],
  description:
    'Get detailed status of a market making session including config, live stats, ' +
    'and recent trades. Returns a human-readable summary alongside raw data.',
  examples: [
    [
      {
        input: {
          sessionId: 'session-uuid-123',
        },
        output: {
          status: 'success',
          data: {
            sessionId: 'session-uuid-123',
            status: 'active',
            totalTrades: 42,
            totalBuys: 22,
            totalSells: 20,
          },
        },
        explanation: 'Get the current status and stats of a market making session.',
      },
    ],
  ],
  schema: z.object({
    sessionId: z.string().describe('Session ID to inspect (from mm-list-sessions)'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    return callApi(
      client,
      'GET',
      `/api/market-making/sessions/${input['sessionId'] as string}`,
    );
  },
};
