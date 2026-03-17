import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const stopLossSetAction: Action = {
  name: 'OPENPUMP_STOP_LOSS_SET',
  similes: [
    'set stop loss on openpump',
    'create stop loss monitor',
    'openpump stop loss',
    'auto-sell on price drop',
    'protect position with stop loss',
  ],
  description:
    'Create a stop-loss monitor on a token. ' +
    'When market cap drops below the trigger, the specified percentage of holdings ' +
    'will be sold automatically. Requires confirm: true to execute.',
  examples: [
    [
      {
        input: {
          walletId: 'wallet-uuid-123',
          mint: 'TokenMintAddress111111111111111',
          triggerMarketCapSol: 5.0,
          confirm: true,
        },
        output: {
          status: 'success',
          data: {
            stopLossId: 'stoploss-uuid-789',
            status: 'active',
          },
        },
        explanation:
          'Set a stop loss that auto-sells when market cap drops below 5 SOL.',
      },
    ],
  ],
  schema: z.object({
    walletId: z.string().describe('Wallet ID holding the token'),
    mint: z
      .string()
      .min(32)
      .max(44)
      .describe('Token mint address to monitor'),
    triggerMarketCapSol: z
      .number()
      .positive()
      .describe('Sell when market cap drops below this SOL value'),
    sellPercent: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Percentage of holdings to sell (default 100%)'),
    slippageBps: z
      .number()
      .int()
      .min(100)
      .max(5000)
      .optional()
      .describe('Slippage tolerance in basis points (default 500 = 5%)'),
    priorityLevel: z
      .enum(['economy', 'normal', 'fast', 'turbo'])
      .optional()
      .describe('Jito priority tier for sell execution'),
    confirm: z
      .boolean()
      .describe('REQUIRED: Must be true to confirm. This will auto-sell when trigger is hit.'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    if (input['confirm'] !== true) {
      throw new Error(
        'stop-loss-set requires explicit confirmation (confirm: true) before execution. ' +
          'This will auto-sell when the trigger is hit.',
      );
    }

    const client = getClient(agent as unknown as Record<string, unknown>);
    const body: Record<string, unknown> = {
      walletId: input['walletId'],
      mint: input['mint'],
      triggerMarketCapSol: input['triggerMarketCapSol'],
    };
    if (input['sellPercent'] !== undefined) body['sellPercent'] = input['sellPercent'];
    if (input['slippageBps'] !== undefined) body['slippageBps'] = input['slippageBps'];
    if (input['priorityLevel'] !== undefined)
      body['priorityLevel'] = input['priorityLevel'];

    return callApi(client, 'POST', '/api/stop-losses', body);
  },
};
