/**
 * OPENPUMP_MM_LIST_SESSIONS action — List all market making sessions.
 *
 * Calls GET /api/market-making/sessions on the OpenPump REST API.
 * Optionally filter by status (active, paused, stopped, error).
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const mmListSessionsAction: Action = {
  name: 'OPENPUMP_MM_LIST_SESSIONS',
  similes: ['MM_LIST', 'LIST_MM_SESSIONS', 'SHOW_MM_SESSIONS', 'MY_MM_SESSIONS'],
  description:
    'List all market making sessions for the authenticated user. ' +
    'Optionally filter by status: active, paused, stopped, or error.',

  examples: [
    [
      { name: 'user', content: { text: 'Show me my market making sessions' } },
      { name: 'agent', content: { text: 'Fetching your market making sessions...' } },
    ],
    [
      { name: 'user', content: { text: 'List active MM sessions' } },
      { name: 'agent', content: { text: 'Looking up active market making sessions...' } },
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

      let path = '/api/market-making/sessions';
      if (status) path += `?status=${encodeURIComponent(status)}`;

      const res = await client.get(path);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Failed to list MM sessions (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_MM_LIST_SESSIONS'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as {
        data: Array<Record<string, unknown>>;
      };
      const sessions = data.data ?? [];

      if (sessions.length === 0) {
        const msg = status
          ? `No market making sessions with status "${status}" found.`
          : 'No market making sessions found.';
        if (callback) await callback({ text: msg, actions: ['OPENPUMP_MM_LIST_SESSIONS'] });
        return { success: true, text: msg, data: { sessions: [] } };
      }

      const lines: string[] = [`Market Making Sessions (${String(sessions.length)}):`];
      for (const sess of sessions) {
        const id = typeof sess['id'] === 'string' ? sess['id'] : String(sess['id'] ?? '');
        const st = typeof sess['status'] === 'string' ? sess['status'] : 'unknown';
        const mint = typeof sess['mint'] === 'string' ? sess['mint'] : 'unknown';
        lines.push(`  - ${id}: ${st} (token: ${mint})`);
      }

      const successMsg = lines.join('\n');
      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_MM_LIST_SESSIONS'] });
      return { success: true, text: successMsg, data: { sessions } };
    } catch (error) {
      const errMsg = `MM session list failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_MM_LIST_SESSIONS'] });
      return { success: false, error: errMsg };
    }
  },
};
