import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const getTokenInfoAction: Action = {
  name: 'OPENPUMP_GET_TOKEN_INFO',
  similes: [
    'get token info on openpump',
    'check pumpfun token status',
    'token bonding curve state',
    'openpump token info',
    'look up token details',
  ],
  description:
    'Get current info about a PumpFun token: name, symbol, price, market cap, ' +
    'bonding curve progress, and graduation status. ' +
    'This is a read-only operation.',
  examples: [
    [
      {
        input: {
          mint: 'TokenMintAddress111111111111111',
        },
        output: {
          status: 'success',
          data: {
            name: 'Cool Token',
            symbol: 'COOL',
            bondingCurveProgress: 0.45,
            graduated: false,
          },
        },
        explanation: 'Retrieve bonding curve state and metadata for a token.',
      },
    ],
  ],
  schema: z.object({
    mint: z.string().describe('Token mint address (base58)'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    const client = getClient(agent as unknown as Record<string, unknown>);
    return callApi(client, 'GET', `/api/tokens/${input['mint'] as string}/curve-state`);
  },
};
