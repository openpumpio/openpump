/**
 * OPENPUMP_MM_STOP_SESSION action — Stop a running market making session.
 *
 * Calls POST /api/market-making/sessions/:sessionId/stop on the OpenPump REST API.
 * Halts all trading immediately. Positions are NOT automatically liquidated.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const mmStopSessionAction: Action = {
  name: 'OPENPUMP_MM_STOP_SESSION',
  similes: ['MM_STOP', 'STOP_MARKET_MAKING', 'STOP_MM_SESSION', 'HALT_MARKET_MAKING'],
  description:
    'Stop a running or paused market making session. Halts all trading immediately. ' +
    'Positions are NOT automatically liquidated — use SELL_TOKEN or SELL_ALL to exit.',

  examples: [
    [
      { name: 'user', content: { text: 'Stop market making session abc-123' } },
      { name: 'agent', content: { text: 'Stopping market making session abc-123...' } },
    ],
    [
      { name: 'user', content: { text: 'Halt the MM session' } },
      { name: 'agent', content: { text: 'Stopping the active market making session...' } },
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
      const sessionId = content['sessionId'] as string | undefined;

      if (!sessionId) {
        if (callback) {
          await callback({
            text: 'I need the session ID to stop a market making session. Use MM_LIST_SESSIONS to find active sessions.',
            actions: ['OPENPUMP_MM_STOP_SESSION'],
          });
        }
        return { success: false, error: 'Missing required parameter: sessionId' };
      }

      const res = await client.post(`/api/market-making/sessions/${sessionId}/stop`, {});

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Failed to stop MM session (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_MM_STOP_SESSION'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const successMsg =
        `Market making session stopped.\n` +
        `Session ID: ${sessionId}\n` +
        `Note: Positions are NOT liquidated. Use SELL_TOKEN to exit positions.`;

      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_MM_STOP_SESSION'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Failed to stop MM session: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_MM_STOP_SESSION'] });
      return { success: false, error: errMsg };
    }
  },
};
