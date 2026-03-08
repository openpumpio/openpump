/**
 * OPENPUMP_BUNDLE_BUY action — Create a token + coordinated multi-wallet buy.
 *
 * Calls POST /api/tokens/bundle-launch on the OpenPump REST API.
 * Async operation — returns a jobId for progress tracking.
 * Uses Jito MEV bundles for same-block execution.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

function resolveImageType(contentType: string): string {
  if (contentType.includes('jpeg')) return 'image/jpeg';
  if (contentType.includes('gif')) return 'image/gif';
  return 'image/png';
}

export const bundleBuyAction: Action = {
  name: 'OPENPUMP_BUNDLE_BUY',
  similes: ['BUNDLE_BUY', 'BUNDLE_LAUNCH', 'COORDINATED_BUY', 'MULTI_WALLET_BUY'],
  description:
    'Atomically create a new PumpFun token and execute coordinated buys from multiple wallets ' +
    'using Jito MEV bundles. Returns a jobId for async tracking. ' +
    'LEGAL WARNING: Coordinated bundle buying may be subject to legal restrictions in your jurisdiction.',

  examples: [
    [
      { name: 'user', content: { text: 'Bundle launch a token DOGE3 with 3 sniper wallets buying 0.5 SOL each' } },
      { name: 'agent', content: { text: 'Preparing bundle launch for DOGE3 with 3 coordinated buy wallets...' } },
    ],
    [
      { name: 'user', content: { text: 'Do a coordinated buy with my dev wallet and 2 buy wallets' } },
      { name: 'agent', content: { text: 'Setting up Jito MEV bundle for coordinated token launch...' } },
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
      const devWalletId = content['devWalletId'] as string | undefined;
      const buyWalletIds = content['buyWalletIds'] as string[] | undefined;
      const name = content['name'] as string | undefined;
      const symbol = content['symbol'] as string | undefined;
      const description = content['description'] as string | undefined;
      const imageUrl = content['imageUrl'] as string | undefined;
      const devBuyAmountLamports = content['devBuyAmountLamports'] as string | undefined;
      const walletBuyAmounts = content['walletBuyAmounts'] as string[] | undefined;

      if (!devWalletId || !buyWalletIds || !name || !symbol || !description || !imageUrl || !devBuyAmountLamports || !walletBuyAmounts) {
        if (callback) {
          await callback({
            text:
              'Bundle launch requires: devWalletId, buyWalletIds[], token name, symbol, description, imageUrl, ' +
              'devBuyAmountLamports, and walletBuyAmounts[]. Please provide all parameters.',
            actions: ['OPENPUMP_BUNDLE_BUY'],
          });
        }
        return { success: false, error: 'Missing required parameters for bundle launch' };
      }

      // Fetch image and convert to base64
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        const errMsg = `Failed to fetch token image from ${imageUrl}: HTTP ${String(imageRes.status)}`;
        if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_BUNDLE_BUY'] });
        return { success: false, error: errMsg };
      }
      const imageBuffer = await imageRes.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString('base64');
      const imgContentType = imageRes.headers.get('content-type') ?? 'image/png';

      const body: Record<string, unknown> = {
        devWalletId,
        buyWalletIds,
        name,
        symbol,
        description,
        imageBase64,
        imageType: resolveImageType(imgContentType),
        devBuyAmountLamports,
        walletBuyAmounts,
        tipLamports: 50_000, // Default normal priority
      };

      const res = await client.post('/api/tokens/bundle-launch', body);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Bundle launch failed (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_BUNDLE_BUY'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as { jobId?: string };
      const successMsg =
        `Bundle launch submitted successfully!\n` +
        `Job ID: ${String(data.jobId ?? 'unknown')}\n` +
        `Token: ${name} (${symbol})\n` +
        `Dev wallet: ${devWalletId}\n` +
        `Buy wallets: ${String(buyWalletIds.length)}\n` +
        `Track progress with the job ID.`;

      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_BUNDLE_BUY'] });
      return { success: true, text: successMsg, data };
    } catch (error) {
      const errMsg = `Bundle launch failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_BUNDLE_BUY'] });
      return { success: false, error: errMsg };
    }
  },
};
