import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const batchCreateWalletsAction: Action = {
  name: 'OPENPUMP_BATCH_CREATE_WALLETS',
  similes: [
    'create multiple wallets on openpump',
    'batch create wallets',
    'bulk wallet creation',
    'openpump create wallets in bulk',
    'generate multiple wallets',
  ],
  description:
    'Create multiple HD-derived managed wallets in a single call (2-50). ' +
    'Labels are auto-numbered: "{labelPrefix}-1", "{labelPrefix}-2", etc. ' +
    'Returns the list of created wallets with IDs and public keys.',
  examples: [
    [
      {
        input: {
          count: 5,
          labelPrefix: 'sniper',
        },
        output: {
          status: 'success',
          data: {
            created: 5,
            wallets: [
              { id: 'uuid-1', publicKey: 'Key1...', label: 'sniper-1' },
              { id: 'uuid-2', publicKey: 'Key2...', label: 'sniper-2' },
            ],
          },
        },
        explanation: 'Create 5 wallets labeled sniper-1 through sniper-5.',
      },
    ],
  ],
  schema: z.object({
    count: z
      .number()
      .int()
      .min(2)
      .max(50)
      .describe('Number of wallets to create (2-50)'),
    labelPrefix: z
      .string()
      .max(90)
      .optional()
      .describe(
        'Optional label prefix. Wallets are named "{prefix}-1", "{prefix}-2", etc. Defaults to "wallet".',
      ),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    const body: Record<string, unknown> = {
      count: input['count'],
    };
    if (input['labelPrefix'] !== undefined) body['labelPrefix'] = input['labelPrefix'];

    return callApi(client, 'POST', '/api/wallets/batch', body);
  },
};
