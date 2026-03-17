/**
 * OPENPUMP_VANITY_ORDER action — Order a vanity Solana wallet address.
 *
 * Calls POST /api/vanity/order on the OpenPump REST API.
 * Mines a wallet address starting with (or containing) a custom pattern.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const vanityOrderAction: Action = {
  name: 'OPENPUMP_VANITY_ORDER',
  similes: ['VANITY_ORDER', 'ORDER_VANITY', 'CUSTOM_ADDRESS', 'VANITY_WALLET'],
  description:
    'Order a vanity Solana wallet address with a custom pattern. ' +
    'Supports prefix, suffix, or contains matching. ' +
    'Mined asynchronously — use VANITY_LIST to check progress.',

  examples: [
    [
      { name: 'user', content: { text: 'Create a vanity wallet starting with "PUMP"' } },
      { name: 'agent', content: { text: 'Ordering vanity wallet address with prefix "PUMP"...' } },
    ],
    [
      { name: 'user', content: { text: 'Get me a wallet containing "DOGE" in the address' } },
      { name: 'agent', content: { text: 'Ordering vanity wallet with "DOGE" pattern...' } },
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
      const pattern = content['pattern'] as string | undefined;

      if (!pattern) {
        if (callback) {
          await callback({
            text: 'I need a pattern (e.g., "PUMP", "DOGE") to order a vanity wallet address.',
            actions: ['OPENPUMP_VANITY_ORDER'],
          });
        }
        return { success: false, error: 'Missing required parameter: pattern' };
      }

      const body: Record<string, unknown> = { pattern };
      if (content['patternType']) body['patternType'] = content['patternType'];
      if (content['caseSensitive'] !== undefined) body['caseSensitive'] = content['caseSensitive'];

      const res = await client.post('/api/vanity/order', body);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Failed to order vanity address (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_VANITY_ORDER'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const jobId = typeof data['jobId'] === 'string' ? data['jobId'] : String(data['jobId'] ?? 'unknown');
      const estTime = data['expectedSeconds'] !== undefined ? `${String(data['expectedSeconds'])}s` : 'unknown';
      const successMsg =
        `Vanity address order placed.\n` +
        `Job ID: ${jobId}\n` +
        `Pattern: "${pattern}"\n` +
        `Estimated Time: ${estTime}\n` +
        `Use VANITY_LIST to check progress.`;

      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_VANITY_ORDER'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Vanity order failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_VANITY_ORDER'] });
      return { success: false, error: errMsg };
    }
  },
};
