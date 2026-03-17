/**
 * OPENPUMP_STOP_LOSS_REMOVE action — Remove a stop-loss monitor.
 *
 * Calls DELETE /api/stop-losses/:stopLossId on the OpenPump REST API.
 * The token will no longer be monitored for price drops.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const stopLossRemoveAction: Action = {
  name: 'OPENPUMP_STOP_LOSS_REMOVE',
  similes: ['STOP_LOSS_REMOVE', 'REMOVE_STOP_LOSS', 'DELETE_STOP_LOSS', 'CANCEL_STOP_LOSS'],
  description:
    'Remove a stop-loss monitor. The token will no longer be monitored for price drops.',

  examples: [
    [
      { name: 'user', content: { text: 'Remove stop-loss abc-123' } },
      { name: 'agent', content: { text: 'Removing stop-loss monitor abc-123...' } },
    ],
    [
      { name: 'user', content: { text: 'Cancel my stop loss on that token' } },
      { name: 'agent', content: { text: 'Removing the stop-loss monitor...' } },
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
      const stopLossId = content['stopLossId'] as string | undefined;

      if (!stopLossId) {
        if (callback) {
          await callback({
            text: 'I need the stop-loss ID to remove it. Use STOP_LOSS_LIST to see active stop-losses.',
            actions: ['OPENPUMP_STOP_LOSS_REMOVE'],
          });
        }
        return { success: false, error: 'Missing required parameter: stopLossId' };
      }

      const res = await client.delete(`/api/stop-losses/${stopLossId}`);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = res.status === 404
          ? `Stop-loss "${stopLossId}" not found. Use STOP_LOSS_LIST to see available stop-losses.`
          : `Failed to remove stop-loss (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_STOP_LOSS_REMOVE'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const successMsg = `Stop-loss monitor removed.\nStop-Loss ID: ${stopLossId}`;

      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_STOP_LOSS_REMOVE'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Failed to remove stop-loss: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_STOP_LOSS_REMOVE'] });
      return { success: false, error: errMsg };
    }
  },
};
