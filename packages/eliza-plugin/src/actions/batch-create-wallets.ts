/**
 * OPENPUMP_BATCH_CREATE_WALLETS action — Create multiple managed wallets at once.
 *
 * Calls POST /api/wallets/batch on the OpenPump REST API.
 * Wallets are HD-derived and auto-labeled with a prefix.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const batchCreateWalletsAction: Action = {
  name: 'OPENPUMP_BATCH_CREATE_WALLETS',
  similes: ['BATCH_CREATE_WALLETS', 'CREATE_WALLETS', 'MAKE_WALLETS', 'GENERATE_WALLETS'],
  description:
    'Create multiple HD-derived managed wallets in a single operation. ' +
    'Labels are auto-numbered with a prefix (e.g., "sniper-1", "sniper-2"). ' +
    'Returns the list of created wallet IDs and public keys.',

  examples: [
    [
      { name: 'user', content: { text: 'Create 5 wallets with prefix "sniper"' } },
      { name: 'agent', content: { text: 'Creating 5 wallets labeled sniper-1 through sniper-5...' } },
    ],
    [
      { name: 'user', content: { text: 'Make 10 new wallets for market making' } },
      { name: 'agent', content: { text: 'Generating 10 new managed wallets...' } },
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
      const count = content['count'] as number | undefined;
      const labelPrefix = content['labelPrefix'] as string | undefined;

      if (!count || count < 2 || count > 50) {
        if (callback) {
          await callback({
            text: 'I need a count between 2 and 50 to batch-create wallets.',
            actions: ['OPENPUMP_BATCH_CREATE_WALLETS'],
          });
        }
        return { success: false, error: 'Missing or invalid parameter: count (must be 2-50)' };
      }

      const body: Record<string, unknown> = { count };
      if (labelPrefix) body['labelPrefix'] = labelPrefix;

      const res = await client.post('/api/wallets/batch', body);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Batch wallet creation failed (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_BATCH_CREATE_WALLETS'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as {
        data: {
          created: Array<{ id: string; publicKey: string; label: string }>;
          successCount: number;
          failureCount: number;
        };
      };

      const result = data.data;
      const lines: string[] = [`Created ${String(result.successCount)} wallet(s):`];
      for (const w of result.created) {
        lines.push(`  - ${w.id} "${w.label}": ${w.publicKey}`);
      }
      if (result.failureCount > 0) {
        lines.push(`  (${String(result.failureCount)} failed)`);
      }

      const successMsg = lines.join('\n');
      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_BATCH_CREATE_WALLETS'] });
      return { success: true, text: successMsg, data: result };
    } catch (error) {
      const errMsg = `Batch wallet creation failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_BATCH_CREATE_WALLETS'] });
      return { success: false, error: errMsg };
    }
  },
};
