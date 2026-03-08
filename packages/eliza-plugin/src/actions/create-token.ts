/**
 * OPENPUMP_CREATE_TOKEN action — Create a new PumpFun token with bonding curve.
 *
 * Calls POST /api/tokens/create on the OpenPump REST API.
 * Uploads metadata and image to IPFS, then submits the creation transaction.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

function resolveImageType(contentType: string): string {
  if (contentType.includes('jpeg')) return 'image/jpeg';
  if (contentType.includes('gif')) return 'image/gif';
  return 'image/png';
}

export const createTokenAction: Action = {
  name: 'OPENPUMP_CREATE_TOKEN',
  similes: ['CREATE_TOKEN', 'LAUNCH_TOKEN', 'DEPLOY_TOKEN', 'MINT_TOKEN'],
  description:
    'Create a new PumpFun token with a bonding curve. Uploads metadata and image to IPFS, ' +
    'then submits the creation transaction. Returns mint address and signature.',

  examples: [
    [
      { name: 'user', content: { text: 'Launch a token called DOGE2 with symbol D2, description "The next doge", use wallet-1' } },
      { name: 'agent', content: { text: 'Creating token DOGE2 (D2) on PumpFun...' } },
    ],
    [
      { name: 'user', content: { text: 'Create a meme token named PEPE3 with my dev wallet' } },
      { name: 'agent', content: { text: 'Deploying new PumpFun token PEPE3...' } },
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
      const walletId = content['walletId'] as string | undefined;
      const name = content['name'] as string | undefined;
      const symbol = content['symbol'] as string | undefined;
      const description = content['description'] as string | undefined;
      const imageUrl = content['imageUrl'] as string | undefined;

      if (!walletId || !name || !symbol || !description || !imageUrl) {
        if (callback) {
          await callback({
            text: 'To create a token I need: wallet ID, token name, symbol, description, and an image URL.',
            actions: ['OPENPUMP_CREATE_TOKEN'],
          });
        }
        return { success: false, error: 'Missing required parameters: walletId, name, symbol, description, imageUrl' };
      }

      // Fetch image and convert to base64 (same pattern as MCP token-tools.ts)
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        const errMsg = `Failed to fetch token image from ${imageUrl}: HTTP ${String(imageRes.status)}`;
        if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_CREATE_TOKEN'] });
        return { success: false, error: errMsg };
      }
      const imageBuffer = await imageRes.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString('base64');
      const contentType = imageRes.headers.get('content-type') ?? 'image/png';

      const body: Record<string, unknown> = {
        walletId,
        name,
        symbol,
        description,
        imageBase64,
        imageType: resolveImageType(contentType),
      };

      // Optional fields
      if (content['twitter']) body['twitter'] = content['twitter'];
      if (content['telegram']) body['telegram'] = content['telegram'];
      if (content['website']) body['website'] = content['website'];
      if (content['initialBuyAmountSol']) body['initialBuyAmountSol'] = content['initialBuyAmountSol'];

      const res = await client.post('/api/tokens/create', body);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Token creation failed (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_CREATE_TOKEN'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const mintAddr = typeof data['mint'] === 'string' ? data['mint'] : 'pending';
      const sig = typeof data['signature'] === 'string' ? data['signature'] : 'pending';
      const successMsg =
        `Token created successfully!\n` +
        `Name: ${name} (${symbol})\n` +
        `Mint: ${mintAddr}\n` +
        `Signature: ${sig}`;

      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_CREATE_TOKEN'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Token creation failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_CREATE_TOKEN'] });
      return { success: false, error: errMsg };
    }
  },
};
