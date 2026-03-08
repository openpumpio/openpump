import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const buyTokenAction: Action = {
  name: 'OPENPUMP_BUY_TOKEN',
  similes: [
    'buy token on openpump',
    'purchase pumpfun token',
    'swap SOL for token via openpump',
    'buy pump token',
    'openpump buy',
  ],
  description:
    'Buy a PumpFun token with SOL via the OpenPump managed wallet API. ' +
    'Requires a wallet ID and token mint address. ' +
    'Uses server-side signing (no local keypair needed). ' +
    'Amount is specified in lamports (1 SOL = 1,000,000,000 lamports).',
  examples: [
    [
      {
        input: {
          walletId: 'wallet-uuid-123',
          mint: 'TokenMintAddress111111111111111',
          amountLamports: '100000000',
        },
        output: {
          status: 'success',
          data: {
            signature: '5KtP...abc',
            tokensReceived: '435541983646',
          },
        },
        explanation: 'Buy 0.1 SOL worth of tokens using the specified managed wallet.',
      },
    ],
  ],
  schema: z.object({
    walletId: z.string().describe('OpenPump managed wallet ID (UUID from list-wallets)'),
    mint: z.string().describe('Token mint address (base58)'),
    amountLamports: z
      .string()
      .regex(/^\d+$/, 'Must be a decimal integer string')
      .describe(
        'SOL amount to spend in lamports as decimal string (e.g. "100000000" = 0.1 SOL)',
      ),
    slippageBps: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .optional()
      .describe('Slippage tolerance in basis points (default: 500 = 5%)'),
    priorityLevel: z
      .enum(['economy', 'normal', 'fast', 'turbo'])
      .optional()
      .describe('Transaction priority tier (default: normal)'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    const body: Record<string, unknown> = {
      walletId: input['walletId'],
      amountLamports: input['amountLamports'],
    };
    if (input['slippageBps'] !== undefined) body['slippageBps'] = input['slippageBps'];
    if (input['priorityLevel'] !== undefined) body['priorityLevel'] = input['priorityLevel'];

    return callApi(client, 'POST', `/api/tokens/${input['mint'] as string}/buy`, body);
  },
};
