import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const vanityListAction: Action = {
  name: 'OPENPUMP_VANITY_LIST',
  similes: [
    'list vanity jobs on openpump',
    'show vanity address orders',
    'openpump vanity jobs',
    'check vanity mining status',
    'view custom address orders',
  ],
  description:
    'List vanity address mining jobs (newest first). ' +
    'Shows status: pending (queued), running (being mined), completed (wallet added), failed. ' +
    'Completed jobs include the wallet ID and public key of the generated address.',
  examples: [
    [
      {
        input: {},
        output: {
          status: 'success',
          data: [
            {
              jobId: 'vanity-job-uuid-123',
              pattern: 'PUMP',
              status: 'completed',
              walletId: 'wallet-uuid-new',
              publicKey: 'PUMP4x7...abc',
            },
          ],
        },
        explanation: 'List all vanity address mining jobs.',
      },
    ],
  ],
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of jobs to return (default 20)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset (default 0)'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    const params: string[] = [];
    if (input['limit'] !== undefined) params.push(`limit=${String(input['limit'])}`);
    if (input['offset'] !== undefined) params.push(`offset=${String(input['offset'])}`);
    const qs = params.length > 0 ? `?${params.join('&')}` : '';
    return callApi(client, 'GET', `/api/vanity/jobs${qs}`);
  },
};
