/**
 * Token creation tools for the OpenPump MCP server.
 *
 * create-token: Submits a token creation request to the REST API and returns
 * the result synchronously (API handles on-chain confirmation internally).
 * Typical confirmation: 2-5 seconds.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { UserContext } from '../lib/context.js';
import { createApiClient } from '../lib/api-client.js';

/**
 * Build an agent-readable error response (never use isError: true for domain errors).
 */
function agentError(code: string, message: string, suggestion?: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: true, code, message, suggestion }),
      },
    ],
  };
}

/**
 * Detect the MIME type from a response Content-Type header or image URL.
 * Defaults to image/png if unknown.
 */
function detectImageMimeType(
  contentType: string | null,
  imageUrl: string,
): 'image/png' | 'image/jpeg' | 'image/jpg' | 'image/gif' | 'image/webp' {
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'] as const;
  type ValidType = (typeof validTypes)[number];

  if (contentType) {
    const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
    if ((validTypes as readonly string[]).includes(normalized)) {
      return normalized as ValidType;
    }
  }

  // Fall back to URL extension
  const lower = imageUrl.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';

  return 'image/png';
}

/**
 * Register the create-token tool.
 *
 * Calls POST /api/tokens/create on the REST API and returns the result directly.
 * The API handles IPFS upload, on-chain transaction, and DB persistence.
 */
export function registerTokenTools(server: McpServer, userContext: UserContext, apiBaseUrl: string): void {
  server.tool(
    'create-token',
    [
      'Create a new token on PumpFun with a bonding curve.',
      'Uploads token metadata and image to IPFS then submits the creation transaction.',
      'Returns the mint address and transaction signature on success.',
      'Typical confirmation: 2-5 seconds.',
      'Not available to US persons. Use at own risk.',
    ].join(' '),
    {
      walletId: z.string().describe('ID of the creator/dev wallet'),
      name: z.string().min(1).max(32).describe('Token name (max 32 chars)'),
      symbol: z.string().min(1).max(10).describe('Token ticker symbol (max 10 chars)'),
      description: z.string().max(500).describe('Token description (max 500 chars)'),
      imageUrl: z
        .string()
        .url()
        .describe('Publicly accessible image URL (will be fetched and uploaded to IPFS)'),
      initialBuyAmountSol: z
        .number()
        .min(0)
        .optional()
        .describe('Optional: SOL amount for dev initial buy at creation'),
      twitter: z.string().optional().describe('Twitter handle (optional)'),
      telegram: z.string().optional().describe('Telegram link (optional)'),
      website: z.string().url().optional().describe('Website URL (optional)'),
    },
    async ({ walletId, name, symbol, description, imageUrl, initialBuyAmountSol, twitter, telegram, website }) => {
      // Verify wallet belongs to this user
      const wallet = userContext.wallets.find((w) => w.id === walletId);
      if (!wallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Wallet "${walletId}" not found for this account.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      // Fetch the image from the provided URL and convert to base64
      let imageBase64: string;
      let imageType: 'image/png' | 'image/jpeg' | 'image/jpg' | 'image/gif' | 'image/webp';

      try {
        const imageRes = await fetch(imageUrl);
        if (!imageRes.ok) {
          return agentError(
            'IMAGE_FETCH_FAILED',
            `Failed to fetch image from URL "${imageUrl}" (HTTP ${imageRes.status.toString()}).`,
            'Ensure the image URL is publicly accessible and returns a valid image.',
          );
        }

        const contentType = imageRes.headers.get('content-type');
        imageType = detectImageMimeType(contentType, imageUrl);

        const imageBuffer = await imageRes.arrayBuffer();
        imageBase64 = Buffer.from(imageBuffer).toString('base64');
      } catch (error) {
        return agentError(
          'IMAGE_FETCH_FAILED',
          `Failed to fetch image: ${error instanceof Error ? error.message : String(error)}`,
          'Ensure the image URL is publicly accessible.',
        );
      }

      // Build request body matching POST /api/tokens/create schema
      const requestBody: Record<string, unknown> = {
        walletIndex: wallet.index,
        name,
        symbol,
        description,
        imageBase64,
        imageType,
      };

      if (initialBuyAmountSol !== undefined && initialBuyAmountSol > 0) {
        requestBody['initialBuyAmountSol'] = initialBuyAmountSol;
      }
      if (twitter !== undefined) requestBody['twitter'] = twitter;
      if (telegram !== undefined) requestBody['telegram'] = telegram;
      if (website !== undefined) requestBody['website'] = website;

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.post('/api/tokens/create', requestBody);

        if (!res.ok) {
          const errBody = await res.text();
          return agentError(
            'TOKEN_CREATION_FAILED',
            `Token creation failed (HTTP ${res.status.toString()}): ${errBody}`,
            'Check the wallet has sufficient SOL and try again.',
          );
        }

        const data: unknown = await res.json();

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        };
      } catch (error) {
        return agentError(
          'API_ERROR',
          `Token creation request failed: ${error instanceof Error ? error.message : String(error)}`,
          'Try again in a few seconds.',
        );
      }
    },
  );
}
