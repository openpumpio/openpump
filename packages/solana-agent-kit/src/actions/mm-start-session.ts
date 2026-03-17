import { z } from 'zod';
import type { Action, SolanaAgentKit } from 'solana-agent-kit';
import { getClient, callApi } from '../utils.js';

export const mmStartSessionAction: Action = {
  name: 'OPENPUMP_MM_START_SESSION',
  similes: [
    'start market making on openpump',
    'begin market making session',
    'openpump start mm',
    'launch market maker bot',
    'start trading bot openpump',
  ],
  description:
    'Start a new market making session on a PumpFun token. ' +
    'The bot will autonomously buy and sell the token across specified wallets using the configured strategy. ' +
    'Requires confirm: true to execute -- this will start spending SOL automatically. ' +
    'Use mm-session-status to monitor progress and mm-stop-session to halt.',
  examples: [
    [
      {
        input: {
          mint: 'TokenMintAddress111111111111111',
          config: {
            amountRange: ['5000000', '50000000'],
            maxPositionSol: '1000000000',
          },
          walletIds: ['wallet-1', 'wallet-2', 'wallet-3'],
          confirm: true,
        },
        output: {
          status: 'success',
          data: {
            sessionId: 'session-uuid-123',
            status: 'active',
          },
        },
        explanation:
          'Start a market making session trading 0.005-0.05 SOL per trade with a 1 SOL max position.',
      },
    ],
  ],
  schema: z.object({
    mint: z.string().describe('Token mint address (base58) to market-make'),
    config: z.object({
      amountRange: z
        .array(z.string().regex(/^\d+$/, 'Must be a decimal integer string'))
        .length(2)
        .describe(
          'Trade amount range [minLamports, maxLamports] (e.g. ["5000000", "50000000"] = 0.005-0.05 SOL)',
        ),
      maxPositionSol: z
        .string()
        .regex(/^\d+$/, 'Must be a decimal integer string')
        .describe(
          'Maximum total SOL deployed per session in lamports (e.g. "1000000000" = 1 SOL)',
        ),
      intervalRange: z
        .array(z.number().int())
        .length(2)
        .optional()
        .describe('Trade interval range [minSeconds, maxSeconds] (default [10, 45])'),
      netBias: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Buy/sell bias: 0.0 = all sells, 0.5 = balanced, 1.0 = all buys'),
      maxDrawdownPercent: z
        .number()
        .min(5)
        .max(500)
        .optional()
        .describe('Circuit breaker: halt session if drawdown exceeds this % (default 15)'),
      maxDurationMinutes: z
        .number()
        .int()
        .min(0)
        .max(10080)
        .optional()
        .describe('Hard session timeout in minutes. 0 = indefinite. Default 1440 (24h)'),
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
        .describe('Jito priority tier for trade execution'),
      volumeMode: z
        .boolean()
        .optional()
        .describe('If true, maintain balanced buy/sell ratio for volume generation'),
    }),
    walletIds: z
      .array(z.string())
      .optional()
      .describe('Explicit wallet IDs to use. Mutually exclusive with walletPoolId.'),
    walletPoolId: z
      .string()
      .optional()
      .describe('Wallet pool ID. Mutually exclusive with walletIds.'),
    confirm: z
      .boolean()
      .describe('REQUIRED: Must be true to start the session.'),
  }),
  handler: async (agent: SolanaAgentKit, input: Record<string, unknown>) => {
    if (input['confirm'] !== true) {
      throw new Error(
        'mm-start-session requires explicit confirmation (confirm: true) before execution. ' +
          'This will start spending SOL automatically.',
      );
    }

    const client = getClient(agent as unknown as Record<string, unknown>);
    const body: Record<string, unknown> = {
      mint: input['mint'],
      config: input['config'],
    };
    if (input['walletIds'] !== undefined) body['walletIds'] = input['walletIds'];
    if (input['walletPoolId'] !== undefined) body['walletPoolId'] = input['walletPoolId'];

    return callApi(client, 'POST', '/api/market-making/sessions', body);
  },
};
