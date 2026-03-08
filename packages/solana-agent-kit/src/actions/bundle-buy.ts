import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

const RICO_WARNING =
  'LEGAL DISCLAIMER: Coordinated bundle buying (wash trading / simultaneous multi-wallet purchase at token creation) ' +
  'may be subject to legal restrictions in your jurisdiction. A RICO lawsuit filed July 2025 is active against ' +
  'bundling services. By using this action you acknowledge awareness of these risks.';

export const bundleBuyAction: Action = {
  name: 'OPENPUMP_BUNDLE_BUY',
  similes: [
    'bundle buy on openpump',
    'coordinated buy pumpfun',
    'multi-wallet token launch',
    'jito bundle launch',
    'openpump bundle buy',
  ],
  description:
    'Atomically create a new PumpFun token and execute coordinated buys from multiple ' +
    'wallets using Jito MEV bundles. Bundle 1 (token creation + up to 3 buy wallets) is ' +
    'atomic and same-block guaranteed. Additional buyers use separate bundles. ' +
    'Returns a jobId for async tracking via poll-job. ' +
    RICO_WARNING,
  examples: [
    [
      {
        input: {
          devWalletId: 'dev-wallet-uuid',
          buyWalletIds: ['wallet-1', 'wallet-2'],
          tokenParams: {
            name: 'Bundle Token',
            symbol: 'BNDL',
            description: 'A bundled launch token',
            imageUrl: 'https://example.com/token.png',
          },
          devBuyAmountSol: '100000000',
          walletBuyAmounts: ['200000000', '300000000'],
          confirm: true,
        },
        output: {
          status: 'success',
          data: {
            jobId: 'job-uuid-789',
            message: 'Bundle launch submitted. Use poll-job to track progress.',
          },
        },
        explanation:
          'Create a token and simultaneously buy from 2 wallets using Jito bundles.',
      },
    ],
  ],
  schema: z.object({
    devWalletId: z.string().describe('ID of the dev/creator wallet'),
    buyWalletIds: z
      .array(z.string())
      .max(20)
      .describe('IDs of wallets to participate in the bundle buy (max 20)'),
    tokenParams: z.object({
      name: z.string().max(32).describe('Token name (max 32 chars)'),
      symbol: z.string().max(10).describe('Token ticker symbol (max 10 chars)'),
      description: z.string().max(500).describe('Token description (max 500 chars)'),
      imageUrl: z.string().url().describe('Token image URL'),
    }),
    devBuyAmountSol: z
      .string()
      .regex(/^\d+$/, 'Must be a decimal integer string')
      .describe(
        'SOL amount for the dev wallet initial buy in lamports (decimal string, e.g. "100000000" = 0.1 SOL)',
      ),
    walletBuyAmounts: z
      .array(z.string().regex(/^\d+$/, 'Must be a decimal integer string'))
      .describe(
        'SOL amount per wallet in lamports (decimal strings), same order as buyWalletIds',
      ),
    priorityLevel: z
      .enum(['economy', 'normal', 'fast', 'turbo'])
      .optional()
      .describe('Transaction priority tier (default: normal)'),
    confirm: z
      .boolean()
      .describe(
        'REQUIRED: Must be true to execute. Acknowledges the RICO lawsuit disclaimer.',
      ),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    if (input['confirm'] !== true) {
      throw new Error(
        'bundle-buy requires explicit confirmation (confirm: true) before execution. ' +
          RICO_WARNING,
      );
    }

    const client = getClient(agent as unknown as Record<string, unknown>);
    const tokenParams = input['tokenParams'] as Record<string, unknown>;

    return callApi(client, 'POST', '/api/tokens/bundle-launch', {
      devWalletId: input['devWalletId'],
      buyWalletIds: input['buyWalletIds'],
      name: tokenParams['name'],
      symbol: tokenParams['symbol'],
      description: tokenParams['description'],
      imageUrl: tokenParams['imageUrl'],
      devBuyAmountLamports: input['devBuyAmountSol'],
      walletBuyAmounts: input['walletBuyAmounts'],
      priorityLevel: input['priorityLevel'] ?? 'normal',
    });
  },
};
