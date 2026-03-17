/**
 * OPENPUMP_STOP_LOSS_LIST action — List all stop-loss monitors.
 *
 * Calls GET /api/stop-losses on the OpenPump REST API.
 * Optionally filter by status: active, triggered, or stopped.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const stopLossListAction: Action = {
  name: 'OPENPUMP_STOP_LOSS_LIST',
  similes: ['STOP_LOSS_LIST', 'LIST_STOP_LOSSES', 'SHOW_STOP_LOSSES', 'MY_STOP_LOSSES'],
  description:
    'List all stop-loss monitors for the authenticated user. ' +
    'Optionally filter by status: active, triggered, or stopped.',

  examples: [
    [
      { name: 'user', content: { text: 'Show me my stop-losses' } },
      { name: 'agent', content: { text: 'Fetching your stop-loss monitors...' } },
    ],
    [
      { name: 'user', content: { text: 'List active stop losses' } },
      { name: 'agent', content: { text: 'Looking up active stop-loss monitors...' } },
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
      const status = content['status'] as string | undefined;

      let path = '/api/stop-losses';
      if (status) path += `?status=${encodeURIComponent(status)}`;

      const res = await client.get(path);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Failed to list stop-losses (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_STOP_LOSS_LIST'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as {
        data: Array<Record<string, unknown>>;
      };
      const stopLosses = data.data ?? [];

      if (stopLosses.length === 0) {
        const msg = status
          ? `No stop-losses with status "${status}" found.`
          : 'No stop-loss monitors found.';
        if (callback) await callback({ text: msg, actions: ['OPENPUMP_STOP_LOSS_LIST'] });
        return { success: true, text: msg, data: { stopLosses: [] } };
      }

      const lines: string[] = [`Stop-Loss Monitors (${String(stopLosses.length)}):`];
      for (const sl of stopLosses) {
        const id = typeof sl['id'] === 'string' ? sl['id'] : String(sl['id'] ?? '');
        const st = typeof sl['status'] === 'string' ? sl['status'] : 'unknown';
        const mint = typeof sl['mint'] === 'string' ? sl['mint'] : 'unknown';
        const trigger = sl['triggerMarketCapSol'] !== undefined ? `${String(sl['triggerMarketCapSol'])} SOL` : 'n/a';
        lines.push(`  - ${id}: ${st} (token: ${mint}, trigger: ${trigger})`);
      }

      const successMsg = lines.join('\n');
      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_STOP_LOSS_LIST'] });
      return { success: true, text: successMsg, data: { stopLosses } };
    } catch (error) {
      const errMsg = `Stop-loss list failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_STOP_LOSS_LIST'] });
      return { success: false, error: errMsg };
    }
  },
};
