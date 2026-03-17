/**
 * OPENPUMP_MM_SESSION_STATUS action — Get detailed status of a market making session.
 *
 * Calls GET /api/market-making/sessions/:sessionId on the OpenPump REST API.
 * Returns config, live stats, trade count, and P&L.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const mmSessionStatusAction: Action = {
  name: 'OPENPUMP_MM_SESSION_STATUS',
  similes: ['MM_STATUS', 'MM_SESSION_STATUS', 'CHECK_MM_SESSION', 'MARKET_MAKING_STATUS'],
  description:
    'Get detailed status of a market making session including config, live stats, ' +
    'trade count, and P&L summary. Read-only operation.',

  examples: [
    [
      { name: 'user', content: { text: 'What is the status of MM session abc-123?' } },
      { name: 'agent', content: { text: 'Fetching market making session status...' } },
    ],
    [
      { name: 'user', content: { text: 'How is my market making session performing?' } },
      { name: 'agent', content: { text: 'Looking up the session performance and stats...' } },
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
            text: 'I need the session ID to check its status. Use MM_LIST_SESSIONS to find your sessions.',
            actions: ['OPENPUMP_MM_SESSION_STATUS'],
          });
        }
        return { success: false, error: 'Missing required parameter: sessionId' };
      }

      const res = await client.get(`/api/market-making/sessions/${sessionId}`);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = res.status === 404
          ? `MM session "${sessionId}" not found. Use MM_LIST_SESSIONS to see available sessions.`
          : `Failed to fetch MM session status (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_MM_SESSION_STATUS'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;

      const s = (val: unknown): string =>
        (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') ? String(val) : JSON.stringify(val);

      const lines: string[] = [`MM Session Status: ${sessionId}`];
      if (data['status']) lines.push(`  Status: ${s(data['status'])}`);
      if (data['mint']) lines.push(`  Token: ${s(data['mint'])}`);
      if (data['tradeCount'] !== undefined) lines.push(`  Trades: ${s(data['tradeCount'])}`);
      if (data['totalBuySol'] !== undefined) lines.push(`  Total Buy: ${s(data['totalBuySol'])} SOL`);
      if (data['totalSellSol'] !== undefined) lines.push(`  Total Sell: ${s(data['totalSellSol'])} SOL`);
      if (data['unrealizedPnlSol'] !== undefined) lines.push(`  Unrealized P&L: ${s(data['unrealizedPnlSol'])} SOL`);
      if (data['realizedPnlSol'] !== undefined) lines.push(`  Realized P&L: ${s(data['realizedPnlSol'])} SOL`);

      const successMsg = lines.join('\n');
      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_MM_SESSION_STATUS'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `MM session status fetch failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_MM_SESSION_STATUS'] });
      return { success: false, error: errMsg };
    }
  },
};
