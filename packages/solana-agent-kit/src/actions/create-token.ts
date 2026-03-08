import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const createTokenAction: Action = {
  name: 'OPENPUMP_CREATE_TOKEN',
  similes: [
    'create token on openpump',
    'launch pumpfun token',
    'deploy new token',
    'mint new pumpfun coin',
    'openpump create token',
  ],
  description:
    'Create a new PumpFun token with a bonding curve. ' +
    'Uploads metadata and image to IPFS, then submits the creation transaction. ' +
    'Returns the mint address and transaction signature. Typical confirmation: 2-5 seconds.',
  examples: [
    [
      {
        input: {
          walletId: 'dev-wallet-uuid',
          name: 'My Token',
          symbol: 'MYTKN',
          description: 'A cool new token',
          imageUrl: 'https://example.com/token.png',
        },
        output: {
          status: 'success',
          data: { mint: 'NewTokenMint111111111111111', signature: 'abc123...' },
        },
        explanation: 'Create a new PumpFun token with the given metadata.',
      },
    ],
  ],
  schema: z.object({
    walletId: z.string().describe('Creator/dev wallet ID'),
    name: z.string().min(1).max(32).describe('Token name (max 32 chars)'),
    symbol: z.string().min(1).max(10).describe('Token ticker symbol (max 10 chars)'),
    description: z.string().max(500).describe('Token description (max 500 chars)'),
    imageUrl: z.string().url().describe('Publicly accessible image URL'),
    initialBuyAmountSol: z
      .number()
      .min(0)
      .optional()
      .describe('Optional SOL amount for dev initial buy at creation'),
    twitter: z.string().optional().describe('Twitter handle'),
    telegram: z.string().optional().describe('Telegram link'),
    website: z.string().url().optional().describe('Website URL'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    const body: Record<string, unknown> = {
      walletId: input['walletId'],
      name: input['name'],
      symbol: input['symbol'],
      description: input['description'],
      imageUrl: input['imageUrl'],
    };
    if (input['initialBuyAmountSol'] !== undefined)
      body['initialBuyAmountSol'] = input['initialBuyAmountSol'];
    if (input['twitter'] !== undefined) body['twitter'] = input['twitter'];
    if (input['telegram'] !== undefined) body['telegram'] = input['telegram'];
    if (input['website'] !== undefined) body['website'] = input['website'];

    return callApi(client, 'POST', '/api/tokens/create', body);
  },
};
