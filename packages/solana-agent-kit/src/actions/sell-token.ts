import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const sellTokenAction: Action = {
  name: 'OPENPUMP_SELL_TOKEN',
  similes: [
    'sell token on openpump',
    'sell pumpfun token',
    'swap token for SOL via openpump',
    'dump token openpump',
    'openpump sell',
  ],
  description:
    'Sell a PumpFun token back to SOL from a managed wallet. ' +
    'Use tokenAmount: "all" to sell the entire balance. ' +
    'Returns the transaction signature and SOL received.',
  examples: [
    [
      {
        input: {
          walletId: 'wallet-uuid-123',
          mint: 'TokenMintAddress111111111111111',
          tokenAmount: 'all',
        },
        output: {
          status: 'success',
          data: {
            signature: '3bXq...def',
            lamportsReceived: '95000000',
          },
        },
        explanation: 'Sell entire token balance from the specified wallet.',
      },
    ],
  ],
  schema: z.object({
    walletId: z.string().describe('Wallet ID holding the token'),
    mint: z.string().describe('Token mint address (base58)'),
    tokenAmount: z
      .union([
        z.string().regex(/^\d+$/, 'Must be a decimal integer string'),
        z.literal('all'),
      ])
      .describe(
        'Raw token base units as decimal string, or "all" to sell entire balance',
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
      tokenAmount: input['tokenAmount'],
    };
    if (input['slippageBps'] !== undefined) body['slippageBps'] = input['slippageBps'];
    if (input['priorityLevel'] !== undefined) body['priorityLevel'] = input['priorityLevel'];

    return callApi(client, 'POST', `/api/tokens/${input['mint'] as string}/sell`, body);
  },
};
