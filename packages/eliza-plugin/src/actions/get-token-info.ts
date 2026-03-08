/**
 * OPENPUMP_GET_TOKEN_INFO action — Get bonding curve state for a PumpFun token.
 *
 * Calls GET /api/tokens/:mint/curve-state on the OpenPump REST API.
 * Read-only operation — no blockchain writes.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const getTokenInfoAction: Action = {
  name: 'OPENPUMP_GET_TOKEN_INFO',
  similes: ['GET_TOKEN_INFO', 'TOKEN_INFO', 'CHECK_TOKEN', 'TOKEN_PRICE', 'TOKEN_STATUS'],
  description:
    'Get current info about a PumpFun token: name, symbol, price, market cap, bonding curve progress, ' +
    'and graduation status. Read-only — no transaction submitted.',

  examples: [
    [
      { name: 'user', content: { text: 'What is the price of token ABC123mint?' } },
      { name: 'agent', content: { text: 'Looking up token ABC123mint on PumpFun...' } },
    ],
    [
      { name: 'user', content: { text: 'Check the bonding curve progress for that new token' } },
      { name: 'agent', content: { text: 'Fetching bonding curve state...' } },
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
      const mint = content['mint'] as string | undefined;

      if (!mint) {
        if (callback) {
          await callback({
            text: 'I need the token mint address to look up its info. Could you provide the mint address?',
            actions: ['OPENPUMP_GET_TOKEN_INFO'],
          });
        }
        return { success: false, error: 'Missing required parameter: mint' };
      }

      const res = await client.get(`/api/tokens/${mint}/curve-state`);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = res.status === 404
          ? `Token with mint "${mint}" was not found on PumpFun. Please verify the mint address.`
          : `Failed to fetch token info (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_GET_TOKEN_INFO'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;

      // Format as readable text -- use JSON.stringify for safety on unknown values
      const s = (val: unknown): string => (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') ? String(val) : JSON.stringify(val);
      const lines: string[] = [`Token Info for ${mint}:`];
      if (data['name']) lines.push(`  Name: ${s(data['name'])}`);
      if (data['symbol']) lines.push(`  Symbol: ${s(data['symbol'])}`);
      if (data['priceSOL'] !== undefined) lines.push(`  Price: ${s(data['priceSOL'])} SOL`);
      if (data['marketCapSOL'] !== undefined) lines.push(`  Market Cap: ${s(data['marketCapSOL'])} SOL`);
      if (data['bondingCurveProgress'] !== undefined) lines.push(`  Bonding Curve: ${s(data['bondingCurveProgress'])}%`);
      if (data['graduated'] !== undefined) lines.push(`  Graduated: ${s(data['graduated'])}`);

      const successMsg = lines.join('\n');
      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_GET_TOKEN_INFO'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Token info fetch failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_GET_TOKEN_INFO'] });
      return { success: false, error: errMsg };
    }
  },
};
