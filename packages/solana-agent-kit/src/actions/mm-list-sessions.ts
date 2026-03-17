import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const mmListSessionsAction: Action = {
  name: 'OPENPUMP_MM_LIST_SESSIONS',
  similes: [
    'list market making sessions on openpump',
    'show all mm sessions',
    'openpump mm sessions',
    'get market maker sessions',
    'view trading bot sessions',
  ],
  description:
    'List all market making sessions for the authenticated user. ' +
    'Optionally filter by status (active, paused, stopped, error). ' +
    'Returns a summary table alongside raw data.',
  examples: [
    [
      {
        input: {},
        output: {
          status: 'success',
          data: [
            {
              sessionId: 'session-uuid-123',
              mint: 'TokenMint111111111111111111111111',
              status: 'active',
            },
          ],
        },
        explanation: 'List all market making sessions.',
      },
    ],
  ],
  schema: z.object({
    status: z
      .enum(['active', 'paused', 'stopped', 'error'])
      .optional()
      .describe('Filter by session status. Omit to return all sessions.'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    let path = '/api/market-making/sessions';
    if (input['status'] !== undefined) {
      path += `?status=${input['status'] as string}`;
    }
    return callApi(client, 'GET', path);
  },
};
