/**
 * OPENPUMP_SNIPE_START action — Start a snipe monitor for auto-buying new tokens.
 *
 * Calls POST /api/snipe-monitors/monitors on the OpenPump REST API.
 * Monitors the pump.fun token feed and auto-buys tokens matching criteria.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const snipeStartAction: Action = {
  name: 'OPENPUMP_SNIPE_START',
  similes: ['SNIPE_START', 'START_SNIPER', 'START_SNIPING', 'AUTO_BUY_NEW_TOKENS'],
  description:
    'Start a snipe monitor that auto-buys new tokens matching criteria. ' +
    'Supports ticker pattern matching (PEPE*, *TRUMP*), market cap range, ' +
    'dev holding %, and social presence filters.',

  examples: [
    [
      { name: 'user', content: { text: 'Start sniping tokens matching PEPE* with 0.1 SOL buys from wallet-1' } },
      { name: 'agent', content: { text: 'Starting snipe monitor for PEPE* tokens...' } },
    ],
    [
      { name: 'user', content: { text: 'Snipe all new tokens with max 5% dev holdings' } },
      { name: 'agent', content: { text: 'Setting up snipe monitor with dev holding filter...' } },
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
      const walletId = content['walletId'] as string | undefined;
      const tickerPattern = content['tickerPattern'] as string | undefined;
      const buyAmountSol = content['buyAmountSol'] as number | undefined;

      if (!walletId || !tickerPattern || !buyAmountSol) {
        if (callback) {
          await callback({
            text: 'I need the wallet ID, ticker pattern, and buy amount in SOL to start a snipe monitor.',
            actions: ['OPENPUMP_SNIPE_START'],
          });
        }
        return { success: false, error: 'Missing required parameters: walletId, tickerPattern, buyAmountSol' };
      }

      const body: Record<string, unknown> = {
        walletId,
        tickerPattern,
        buyAmountSol,
      };

      // Optional filters
      if (content['maxDevPercent'] !== undefined) body['maxDevPercent'] = content['maxDevPercent'];
      if (content['maxTop10Percent'] !== undefined) body['maxTop10Percent'] = content['maxTop10Percent'];
      if (content['maxSniperCount'] !== undefined) body['maxSniperCount'] = content['maxSniperCount'];
      if (content['maxAgeSeconds'] !== undefined) body['maxAgeSeconds'] = content['maxAgeSeconds'];
      if (content['minMarketCapSol'] !== undefined) body['minMarketCapSol'] = content['minMarketCapSol'];
      if (content['maxMarketCapSol'] !== undefined) body['maxMarketCapSol'] = content['maxMarketCapSol'];
      if (content['requireSocial'] !== undefined) body['requireSocial'] = content['requireSocial'];
      if (content['maxBuys'] !== undefined) body['maxBuys'] = content['maxBuys'];
      if (content['slippageBps'] !== undefined) body['slippageBps'] = content['slippageBps'];
      if (content['priorityLevel']) body['priorityLevel'] = content['priorityLevel'];

      const res = await client.post('/api/snipe-monitors/monitors', body);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Failed to start snipe monitor (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_SNIPE_START'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const monitorId = typeof data['monitorId'] === 'string' ? data['monitorId'] : String(data['monitorId'] ?? 'unknown');
      const successMsg =
        `Snipe monitor started successfully.\n` +
        `Monitor ID: ${monitorId}\n` +
        `Pattern: ${tickerPattern}\n` +
        `Buy Amount: ${String(buyAmountSol)} SOL\n` +
        `Wallet: ${walletId}`;

      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_SNIPE_START'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Failed to start snipe monitor: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_SNIPE_START'] });
      return { success: false, error: errMsg };
    }
  },
};
