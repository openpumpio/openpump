/**
 * OPENPUMP_SNIPE_LIST action — List all snipe monitors.
 *
 * Calls GET /api/snipe-monitors/monitors on the OpenPump REST API.
 * Optionally filter by status: active, paused, or stopped.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const snipeListAction: Action = {
  name: 'OPENPUMP_SNIPE_LIST',
  similes: ['SNIPE_LIST', 'LIST_SNIPERS', 'SHOW_SNIPE_MONITORS', 'MY_SNIPERS'],
  description:
    'List all snipe monitors for the authenticated user. ' +
    'Optionally filter by status: active, paused, or stopped.',

  examples: [
    [
      { name: 'user', content: { text: 'Show me my snipe monitors' } },
      { name: 'agent', content: { text: 'Fetching your snipe monitors...' } },
    ],
    [
      { name: 'user', content: { text: 'List active snipers' } },
      { name: 'agent', content: { text: 'Looking up active snipe monitors...' } },
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

      let path = '/api/snipe-monitors/monitors';
      if (status) path += `?status=${encodeURIComponent(status)}`;

      const res = await client.get(path);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Failed to list snipe monitors (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_SNIPE_LIST'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as {
        data: Array<Record<string, unknown>>;
      };
      const monitors = data.data ?? [];

      if (monitors.length === 0) {
        const msg = status
          ? `No snipe monitors with status "${status}" found.`
          : 'No snipe monitors found.';
        if (callback) await callback({ text: msg, actions: ['OPENPUMP_SNIPE_LIST'] });
        return { success: true, text: msg, data: { monitors: [] } };
      }

      const lines: string[] = [`Snipe Monitors (${String(monitors.length)}):`];
      for (const mon of monitors) {
        const id = typeof mon['id'] === 'string' ? mon['id'] : String(mon['id'] ?? '');
        const st = typeof mon['status'] === 'string' ? mon['status'] : 'unknown';
        const pattern = typeof mon['tickerPattern'] === 'string' ? mon['tickerPattern'] : '*';
        lines.push(`  - ${id}: ${st} (pattern: ${pattern})`);
      }

      const successMsg = lines.join('\n');
      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_SNIPE_LIST'] });
      return { success: true, text: successMsg, data: { monitors } };
    } catch (error) {
      const errMsg = `Snipe monitor list failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_SNIPE_LIST'] });
      return { success: false, error: errMsg };
    }
  },
};
