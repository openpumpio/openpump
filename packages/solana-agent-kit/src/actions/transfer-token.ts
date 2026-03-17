import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const transferTokenAction: Action = {
  name: 'OPENPUMP_TRANSFER_TOKEN',
  similes: [
    'send token on openpump',
    'transfer SPL token',
    'move tokens to address',
    'openpump send token',
    'withdraw token from wallet',
  ],
  description:
    'Send SPL tokens from a managed wallet to any Solana address (internal or external). ' +
    'Use tokenAmount: "all" to send the entire balance. ' +
    'If the destination lacks a token account for this mint, one is created (~0.002 SOL rent, paid by sender).',
  examples: [
    [
      {
        input: {
          fromWalletId: 'wallet-uuid-123',
          toAddress: 'RecipientPubKey111111111111111',
          mint: 'TokenMintAddress111111111111111',
          tokenAmount: 'all',
        },
        output: {
          status: 'success',
          data: {
            signature: '7aBc...xyz',
            amount: '1000000',
          },
        },
        explanation: 'Transfer all tokens of the specified mint to an external address.',
      },
    ],
  ],
  schema: z.object({
    fromWalletId: z.string().describe('ID of the source wallet holding the token'),
    toAddress: z
      .string()
      .describe('Destination Solana address (base58). Accepts any valid address.'),
    mint: z.string().describe('SPL token mint address (base58)'),
    tokenAmount: z
      .union([
        z.string().regex(/^\d+$/, 'Must be a decimal integer string'),
        z.literal('all'),
      ])
      .describe(
        'Raw token base units as decimal string, or "all" to transfer entire balance',
      ),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    return callApi(
      client,
      'POST',
      `/api/wallets/${input['fromWalletId'] as string}/transfer`,
      {
        toAddress: input['toAddress'],
        mint: input['mint'],
        tokenAmount: input['tokenAmount'],
      },
    );
  },
};
