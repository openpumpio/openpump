import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const snipeStartAction: Action = {
  name: 'OPENPUMP_SNIPE_START',
  similes: [
    'start sniper on openpump',
    'begin sniping tokens',
    'openpump start snipe monitor',
    'auto-buy new tokens',
    'launch snipe bot',
  ],
  description:
    'Create and start a snipe monitor that auto-buys new tokens matching criteria. ' +
    'Monitors the real-time PumpFun token feed and buys when a new token matches. ' +
    'Supports ticker pattern matching (glob: PEPE*, *TRUMP*, DOGE), market cap range, ' +
    'dev holding %, top 10 holders %, sniper count, token age, and social presence filters. ' +
    'Requires confirm: true to execute.',
  examples: [
    [
      {
        input: {
          walletId: 'wallet-uuid-123',
          tickerPattern: 'PEPE*',
          buyAmountSol: 0.05,
          confirm: true,
        },
        output: {
          status: 'success',
          data: {
            monitorId: 'monitor-uuid-456',
            status: 'active',
          },
        },
        explanation:
          'Start a snipe monitor that auto-buys 0.05 SOL of any new token with a ticker starting with "PEPE".',
      },
    ],
  ],
  schema: z.object({
    walletId: z.string().describe('Wallet ID to use for buying matched tokens'),
    tickerPattern: z
      .string()
      .min(1)
      .max(100)
      .describe(
        'Glob pattern to match token ticker symbols. Case-insensitive. Examples: "PEPE*", "*TRUMP*", "DOGE"',
      ),
    buyAmountSol: z
      .number()
      .positive()
      .max(100)
      .describe('Amount of SOL to spend per buy'),
    maxBuys: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Stop monitor after N successful buys (null = unlimited)'),
    maxDevPercent: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('Max dev holding percentage (filter rugs). E.g. 10 = max 10%'),
    maxTop10Percent: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('Max top 10 holders percentage. E.g. 50 = max 50%'),
    maxSniperCount: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Max number of snipers allowed on the token'),
    maxAgeSeconds: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Only buy tokens younger than N seconds'),
    requireSocial: z
      .boolean()
      .optional()
      .describe('Require twitter, telegram, or website presence'),
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
      .describe('Jito priority tier for buy execution (default "fast")'),
    confirm: z
      .boolean()
      .describe('REQUIRED: Must be true to confirm. This will start auto-buying tokens.'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    if (input['confirm'] !== true) {
      throw new Error(
        'snipe-start requires explicit confirmation (confirm: true) before execution. ' +
          'This will start auto-buying tokens.',
      );
    }

    const client = getClient(agent as unknown as Record<string, unknown>);
    const body: Record<string, unknown> = {
      walletId: input['walletId'],
      tickerPattern: input['tickerPattern'],
      buyAmountSol: input['buyAmountSol'],
    };
    if (input['maxBuys'] !== undefined) body['maxBuys'] = input['maxBuys'];
    if (input['maxDevPercent'] !== undefined) body['maxDevPercent'] = input['maxDevPercent'];
    if (input['maxTop10Percent'] !== undefined)
      body['maxTop10Percent'] = input['maxTop10Percent'];
    if (input['maxSniperCount'] !== undefined)
      body['maxSniperCount'] = input['maxSniperCount'];
    if (input['maxAgeSeconds'] !== undefined) body['maxAgeSeconds'] = input['maxAgeSeconds'];
    if (input['requireSocial'] !== undefined) body['requireSocial'] = input['requireSocial'];
    if (input['slippageBps'] !== undefined) body['slippageBps'] = input['slippageBps'];
    if (input['priorityLevel'] !== undefined)
      body['priorityLevel'] = input['priorityLevel'];

    return callApi(client, 'POST', '/api/snipe-monitors/monitors', body);
  },
};
