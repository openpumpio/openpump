import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const mmStopSessionAction: Action = {
  name: 'OPENPUMP_MM_STOP_SESSION',
  similes: [
    'stop market making on openpump',
    'halt market making session',
    'openpump stop mm',
    'kill market maker bot',
    'stop trading bot openpump',
  ],
  description:
    'Stop a running or paused market making session. ' +
    'This halts all trading immediately and marks the session as stopped. ' +
    'Positions are NOT automatically liquidated -- use sell-token or bundle-sell to exit.',
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
            status: 'stopped',
          },
        },
        explanation: 'Stop a running market making session.',
      },
    ],
  ],
  schema: z.object({
    sessionId: z.string().describe('Session ID to stop (from mm-list-sessions)'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    return callApi(
      client,
      'POST',
      `/api/market-making/sessions/${input['sessionId'] as string}/stop`,
    );
  },
};
