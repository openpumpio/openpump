/**
 * OPENPUMP_SNIPE_STOP action — Stop a snipe monitor permanently.
 *
 * Calls POST /api/snipe-monitors/monitors/:monitorId/stop on the OpenPump REST API.
 * The monitor will no longer match or buy tokens.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const snipeStopAction: Action = {
  name: 'OPENPUMP_SNIPE_STOP',
  similes: ['SNIPE_STOP', 'STOP_SNIPER', 'STOP_SNIPING', 'CANCEL_SNIPE'],
  description:
    'Stop a snipe monitor permanently. The monitor will no longer match or auto-buy tokens.',

  examples: [
    [
      { name: 'user', content: { text: 'Stop snipe monitor abc-123' } },
      { name: 'agent', content: { text: 'Stopping snipe monitor abc-123...' } },
    ],
    [
      { name: 'user', content: { text: 'Cancel my sniper' } },
      { name: 'agent', content: { text: 'Stopping the snipe monitor...' } },
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
      const monitorId = content['monitorId'] as string | undefined;

      if (!monitorId) {
        if (callback) {
          await callback({
            text: 'I need the monitor ID to stop a snipe monitor. Use SNIPE_LIST to see active monitors.',
            actions: ['OPENPUMP_SNIPE_STOP'],
          });
        }
        return { success: false, error: 'Missing required parameter: monitorId' };
      }

      const res = await client.post(`/api/snipe-monitors/monitors/${monitorId}/stop`, {});

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Failed to stop snipe monitor (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_SNIPE_STOP'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const successMsg = `Snipe monitor stopped.\nMonitor ID: ${monitorId}`;

      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_SNIPE_STOP'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Failed to stop snipe monitor: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_SNIPE_STOP'] });
      return { success: false, error: errMsg };
    }
  },
};
