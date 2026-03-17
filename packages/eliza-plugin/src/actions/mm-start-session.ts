/**
 * OPENPUMP_MM_START_SESSION action — Start a market making session.
 *
 * Calls POST /api/market-making/sessions on the OpenPump REST API.
 * The bot autonomously trades the token across wallets using the configured strategy.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const mmStartSessionAction: Action = {
  name: 'OPENPUMP_MM_START_SESSION',
  similes: ['MM_START', 'START_MARKET_MAKING', 'START_MM_SESSION', 'BEGIN_MARKET_MAKING'],
  description:
    'Start a new market making session on a PumpFun token. The bot autonomously buys and sells ' +
    'across wallets using the configured strategy. Requires mint, wallet pool or wallet IDs, ' +
    'and config (amountRange, maxPositionSol). Returns session ID for tracking.',

  examples: [
    [
      { name: 'user', content: { text: 'Start market making on token ABC with my pool' } },
      { name: 'agent', content: { text: 'Starting market making session for token ABC...' } },
    ],
    [
      { name: 'user', content: { text: 'Begin MM on that new token with 0.01-0.05 SOL trades' } },
      { name: 'agent', content: { text: 'Configuring and starting market making session...' } },
    ],
  ],

  validate: (runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<boolean> => {
    const apiKey = runtime.getSetting('OPENPUMP_API_KEY');
    return Promise.resolve(typeof apiKey === 'string' && apiKey.length > 0);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    try {
      const client = getClient(runtime);
      const content = message.content as Record<string, unknown>;
      const mint = content['mint'] as string | undefined;
      const walletPoolId = content['walletPoolId'] as string | undefined;
      const walletIds = content['walletIds'] as string[] | undefined;
      const config = content['config'] as Record<string, unknown> | undefined;

      if (!mint || !config) {
        if (callback) {
          await callback({
            text: 'I need the token mint address and a config object (with amountRange and maxPositionSol) to start a market making session.',
            actions: ['OPENPUMP_MM_START_SESSION'],
          });
        }
        return { success: false, error: 'Missing required parameters: mint, config' };
      }

      if (!walletPoolId && !walletIds) {
        if (callback) {
          await callback({
            text: 'I need either a walletPoolId or walletIds array to know which wallets to use for market making.',
            actions: ['OPENPUMP_MM_START_SESSION'],
          });
        }
        return { success: false, error: 'Missing required parameter: walletPoolId or walletIds' };
      }

      const body: Record<string, unknown> = { mint, config };
      if (walletPoolId) body['walletPoolId'] = walletPoolId;
      if (walletIds) body['walletIds'] = walletIds;

      const res = await client.post('/api/market-making/sessions', body);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Failed to start MM session (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_MM_START_SESSION'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const sessionId = typeof data['sessionId'] === 'string' ? data['sessionId'] : String(data['sessionId'] ?? 'unknown');
      const successMsg =
        `Market making session started successfully.\n` +
        `Session ID: ${sessionId}\n` +
        `Token: ${mint}\n` +
        `Use MM_SESSION_STATUS to monitor progress.`;

      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_MM_START_SESSION'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Failed to start MM session: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_MM_START_SESSION'] });
      return { success: false, error: errMsg };
    }
  },
};
