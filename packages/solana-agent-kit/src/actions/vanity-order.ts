import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const vanityOrderAction: Action = {
  name: 'OPENPUMP_VANITY_ORDER',
  similes: [
    'order vanity address on openpump',
    'create custom wallet address',
    'openpump vanity address',
    'mine custom Solana address',
    'get custom public key',
  ],
  description:
    'Order a vanity Solana wallet address that starts with, ends with, or contains a custom pattern. ' +
    'Credits are deducted immediately. The address is mined asynchronously. ' +
    'Use vanity-list to poll for completion, then list-wallets to see the new wallet.',
  examples: [
    [
      {
        input: {
          pattern: 'PUMP',
          patternType: 'prefix',
          caseSensitive: true,
        },
        output: {
          status: 'success',
          data: {
            jobId: 'vanity-job-uuid-123',
            expectedSeconds: 120,
          },
        },
        explanation: 'Order a wallet address that starts with "PUMP".',
      },
    ],
  ],
  schema: z.object({
    pattern: z
      .string()
      .min(1)
      .max(8)
      .describe('The character pattern to embed in the address (max 8 chars)'),
    patternType: z
      .enum(['prefix', 'suffix', 'contains'])
      .optional()
      .describe(
        'Where the pattern must appear: prefix (start), suffix (end), or contains (anywhere). Default: prefix.',
      ),
    caseSensitive: z
      .boolean()
      .optional()
      .describe(
        'Whether the match must be exact case. Case-insensitive is cheaper. Default: true.',
      ),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    const body: Record<string, unknown> = {
      pattern: input['pattern'],
    };
    if (input['patternType'] !== undefined) body['patternType'] = input['patternType'];
    if (input['caseSensitive'] !== undefined)
      body['caseSensitive'] = input['caseSensitive'];

    return callApi(client, 'POST', '/api/vanity/order', body);
  },
};
