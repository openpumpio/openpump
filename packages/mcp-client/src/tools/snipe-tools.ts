/**
 * Snipe monitor and stop-loss tools for the OpenPump MCP server (publishable package).
 *
 * Snipe monitor tools (7):
 * - snipe-start:    Create and start a snipe monitor with criteria
 * - snipe-stop:     Stop a snipe monitor
 * - snipe-pause:    Pause monitoring (keep config)
 * - snipe-resume:   Resume paused monitor
 * - snipe-update:   Update criteria on active monitor
 * - snipe-status:   Get monitor status and stats
 * - snipe-list:     List all monitors for user
 *
 * Stop-loss tools (4):
 * - stop-loss-set:     Create stop-loss on a token
 * - stop-loss-remove:  Remove a stop-loss
 * - stop-loss-list:    List all active stop-losses
 * - stop-loss-status:  Get stop-loss details
 *
 * Total: 11 tools.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { UserContext } from '../lib/context.js';
import { createApiClient } from '../lib/api-client.js';

const DISCLAIMER = 'Not available to US persons. Use at own risk.';
const SNIPE_BASE = '/api/snipe-monitors/monitors';
const STOP_LOSS_BASE = '/api/stop-losses';

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

async function parseApiError(res: Response): Promise<{ code: string; message: string }> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { code?: string; message?: string; error?: string };
    return {
      code: parsed.code ?? parsed.error ?? 'SNIPE_ERROR',
      message: parsed.message ?? text,
    };
  } catch {
    return { code: 'SNIPE_ERROR', message: text };
  }
}

const WRITE_ANNOTATIONS = {
  destructiveHint: true,
  idempotentHint: false,
  readOnlyHint: false,
  openWorldHint: true,
} as const;

const READ_ANNOTATIONS = {
  destructiveHint: false,
  idempotentHint: true,
  readOnlyHint: true,
  openWorldHint: false,
} as const;

// ---------------------------------------------------------------------------
// Register all snipe + stop-loss tools
// ---------------------------------------------------------------------------

export function registerSnipeTools(server: McpServer, userContext: UserContext, apiBaseUrl: string): void {
  // ── snipe-start ──────────────────────────────────────────────────────────

  server.tool(
    'snipe-start',
    [
      'Create and start a snipe monitor that auto-buys new tokens matching criteria.',
      'Monitors the real-time pump.fun token feed and buys when a new token matches.',
      'Supports ticker pattern matching (glob: PEPE*, *TRUMP*, DOGE), market cap range,',
      'dev holding %, top 10 holders %, sniper count, token age, and social presence filters.',
      DISCLAIMER,
    ].join(' '),
    {
      walletId: z
        .string()
        .uuid()
        .describe('Wallet ID to use for buying matched tokens'),
      tickerPattern: z
        .string()
        .min(1)
        .max(100)
        .describe(
          'Glob pattern to match token ticker symbols. ' +
          'Use * for any chars, ? for single char. Case-insensitive. ' +
          'Examples: "PEPE*", "*TRUMP*", "DOGE", "*"',
        ),
      buyAmountSol: z
        .number()
        .positive()
        .max(100)
        .describe('Amount of SOL to spend per buy'),
      minMarketCapSol: z
        .number()
        .min(0)
        .optional()
        .describe('Minimum market cap in SOL (filter out micro-caps)'),
      maxMarketCapSol: z
        .number()
        .positive()
        .optional()
        .describe('Maximum market cap in SOL (filter out large caps)'),
      maxDevPercent: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe('Max dev holding percentage (filter rugs). E.g. 10 = max 10%'),
      maxTop10Percent: z
        .number()
        .min(0)
        .max(100)
        .optional()
        .describe('Max top 10 holders percentage. E.g. 50 = max 50%'),
      maxSniperCount: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Max number of snipers allowed on the token'),
      maxAgeSeconds: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Only buy tokens younger than N seconds'),
      requireSocial: z
        .boolean()
        .optional()
        .describe('Require twitter, telegram, or website presence'),
      slippageBps: z
        .number()
        .int()
        .min(100)
        .max(5000)
        .optional()
        .describe('Slippage tolerance in basis points (default 500 = 5%)'),
      priorityLevel: z
        .enum(['economy', 'normal', 'fast', 'turbo'])
        .optional()
        .describe('Jito priority tier for buy execution (default "fast")'),
      maxBuys: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Stop monitor after N successful buys (null = unlimited)'),
      confirm: z
        .boolean()
        .describe('Must be true to confirm. This will start auto-buying tokens.'),
    },
    WRITE_ANNOTATIONS,
    async (params) => {
      if (!params.confirm) {
        return agentError(
          'CONFIRMATION_REQUIRED',
          'Set confirm=true to start the snipe monitor.',
          'This will start automatically buying tokens matching your criteria.',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const { confirm: _, ...body } = params;
        const res = await api.post(SNIPE_BASE, body);

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(
            code,
            `Failed to create snipe monitor (HTTP ${res.status.toString()}): ${message}`,
          );
        }

        const data = await res.json() as Record<string, unknown>;
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: 'Snipe monitor created and started',
              monitor: data,
            }),
          }],
        };
      } catch (error) {
        return agentError('NETWORK_ERROR', (error as Error).message);
      }
    },
  );

  // ── snipe-stop ───────────────────────────────────────────────────────────

  server.tool(
    'snipe-stop',
    'Stop a snipe monitor permanently. The monitor will no longer match or buy tokens.',
    {
      monitorId: z.string().uuid().describe('ID of the snipe monitor to stop'),
      confirm: z.boolean().describe('Must be true to confirm stopping the monitor.'),
    },
    WRITE_ANNOTATIONS,
    async ({ monitorId, confirm }) => {
      if (!confirm) {
        return agentError('CONFIRMATION_REQUIRED', 'Set confirm=true to stop the monitor.');
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.post(`${SNIPE_BASE}/${monitorId}/stop`, {});

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(code, `Failed to stop monitor (HTTP ${res.status.toString()}): ${message}`);
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: 'Snipe monitor stopped', monitorId }),
          }],
        };
      } catch (error) {
        return agentError('NETWORK_ERROR', (error as Error).message);
      }
    },
  );

  // ── snipe-pause ──────────────────────────────────────────────────────────

  server.tool(
    'snipe-pause',
    'Pause a snipe monitor temporarily. Config is preserved; resume to reactivate.',
    {
      monitorId: z.string().uuid().describe('ID of the snipe monitor to pause'),
    },
    WRITE_ANNOTATIONS,
    async ({ monitorId }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.post(`${SNIPE_BASE}/${monitorId}/pause`, {});

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(code, `Failed to pause monitor (HTTP ${res.status.toString()}): ${message}`);
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: 'Snipe monitor paused', monitorId }),
          }],
        };
      } catch (error) {
        return agentError('NETWORK_ERROR', (error as Error).message);
      }
    },
  );

  // ── snipe-resume ─────────────────────────────────────────────────────────

  server.tool(
    'snipe-resume',
    'Resume a paused snipe monitor. Reactivates token matching and auto-buying.',
    {
      monitorId: z.string().uuid().describe('ID of the snipe monitor to resume'),
    },
    WRITE_ANNOTATIONS,
    async ({ monitorId }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.post(`${SNIPE_BASE}/${monitorId}/resume`, {});

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(code, `Failed to resume monitor (HTTP ${res.status.toString()}): ${message}`);
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: 'Snipe monitor resumed', monitorId }),
          }],
        };
      } catch (error) {
        return agentError('NETWORK_ERROR', (error as Error).message);
      }
    },
  );

  // ── snipe-update ─────────────────────────────────────────────────────────

  server.tool(
    'snipe-update',
    [
      'Update criteria on an active or paused snipe monitor.',
      'Only provide the fields you want to change.',
      'Changes take effect immediately on active monitors.',
    ].join(' '),
    {
      monitorId: z.string().uuid().describe('ID of the snipe monitor to update'),
      tickerPattern: z.string().min(1).max(100).optional().describe('New ticker glob pattern'),
      buyAmountSol: z.number().positive().max(100).optional().describe('New buy amount in SOL'),
      minMarketCapSol: z.number().min(0).optional().describe('New minimum market cap in SOL'),
      maxMarketCapSol: z.number().positive().optional().describe('New maximum market cap in SOL'),
      maxDevPercent: z.number().min(0).max(100).optional().describe('New max dev holding %'),
      maxTop10Percent: z.number().min(0).max(100).optional().describe('New max top 10 holders %'),
      maxSniperCount: z.number().int().min(0).optional().describe('New max sniper count'),
      maxAgeSeconds: z.number().int().min(1).optional().describe('New max token age in seconds'),
      requireSocial: z.boolean().optional().describe('New social presence requirement'),
      slippageBps: z.number().int().min(100).max(5000).optional().describe('New slippage in bps'),
      priorityLevel: z.enum(['economy', 'normal', 'fast', 'turbo']).optional().describe('New priority tier'),
      maxBuys: z.number().int().min(1).optional().describe('New max buys limit'),
    },
    WRITE_ANNOTATIONS,
    async ({ monitorId, ...updates }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.patch(`${SNIPE_BASE}/${monitorId}`, updates);

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(code, `Failed to update monitor (HTTP ${res.status.toString()}): ${message}`);
        }

        const data = await res.json() as Record<string, unknown>;
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: 'Snipe monitor updated', monitor: data }),
          }],
        };
      } catch (error) {
        return agentError('NETWORK_ERROR', (error as Error).message);
      }
    },
  );

  // ── snipe-status ─────────────────────────────────────────────────────────

  server.tool(
    'snipe-status',
    'Get detailed status of a snipe monitor including criteria, buy count, and current state.',
    {
      monitorId: z.string().uuid().describe('ID of the snipe monitor'),
    },
    READ_ANNOTATIONS,
    async ({ monitorId }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get(`${SNIPE_BASE}/${monitorId}`);

        if (!res.ok) {
          if (res.status === 404) {
            return agentError('NOT_FOUND', 'Snipe monitor not found');
          }
          const { code, message } = await parseApiError(res);
          return agentError(code, message);
        }

        const data = await res.json() as Record<string, unknown>;
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        };
      } catch (error) {
        return agentError('NETWORK_ERROR', (error as Error).message);
      }
    },
  );

  // ── snipe-list ───────────────────────────────────────────────────────────

  server.tool(
    'snipe-list',
    'List all snipe monitors for the authenticated user. Optionally filter by status.',
    {
      status: z
        .enum(['active', 'paused', 'stopped'])
        .optional()
        .describe('Filter by monitor status'),
    },
    READ_ANNOTATIONS,
    async ({ status }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const query = status ? `?status=${status}` : '';
        const res = await api.get(`${SNIPE_BASE}${query}`);

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(code, message);
        }

        const data = await res.json() as Record<string, unknown>;
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        };
      } catch (error) {
        return agentError('NETWORK_ERROR', (error as Error).message);
      }
    },
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Stop-Loss Tools
  // ═══════════════════════════════════════════════════════════════════════════

  // ── stop-loss-set ────────────────────────────────────────────────────────

  server.tool(
    'stop-loss-set',
    [
      'Create a stop-loss monitor on a token. When market cap drops below the trigger,',
      'the specified percentage of holdings will be sold automatically.',
      DISCLAIMER,
    ].join(' '),
    {
      walletId: z.string().uuid().describe('Wallet ID holding the token'),
      mint: z.string().min(32).max(44).describe('Token mint address to monitor'),
      triggerMarketCapSol: z
        .number()
        .positive()
        .describe('Sell when market cap drops below this SOL value'),
      sellPercent: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Percentage of holdings to sell (default 100%)'),
      slippageBps: z
        .number()
        .int()
        .min(100)
        .max(5000)
        .optional()
        .describe('Slippage tolerance in basis points (default 500 = 5%)'),
      priorityLevel: z
        .enum(['economy', 'normal', 'fast', 'turbo'])
        .optional()
        .describe('Jito priority tier for sell execution'),
      confirm: z
        .boolean()
        .describe('Must be true to confirm. This will auto-sell when trigger is hit.'),
    },
    WRITE_ANNOTATIONS,
    async (params) => {
      if (!params.confirm) {
        return agentError(
          'CONFIRMATION_REQUIRED',
          'Set confirm=true to create the stop-loss.',
          'This will automatically sell tokens when the market cap drops below your trigger.',
        );
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const { confirm: _, ...body } = params;
        const res = await api.post(STOP_LOSS_BASE, body);

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(
            code,
            `Failed to create stop-loss (HTTP ${res.status.toString()}): ${message}`,
          );
        }

        const data = await res.json() as Record<string, unknown>;
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: 'Stop-loss created and active',
              stopLoss: data,
            }),
          }],
        };
      } catch (error) {
        return agentError('NETWORK_ERROR', (error as Error).message);
      }
    },
  );

  // ── stop-loss-remove ─────────────────────────────────────────────────────

  server.tool(
    'stop-loss-remove',
    'Remove a stop-loss monitor. The token will no longer be monitored for price drops.',
    {
      stopLossId: z.string().uuid().describe('ID of the stop-loss to remove'),
      confirm: z.boolean().describe('Must be true to confirm removal.'),
    },
    WRITE_ANNOTATIONS,
    async ({ stopLossId, confirm }) => {
      if (!confirm) {
        return agentError('CONFIRMATION_REQUIRED', 'Set confirm=true to remove the stop-loss.');
      }

      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.delete(`${STOP_LOSS_BASE}/${stopLossId}`);

        if (!res.ok) {
          if (res.status === 404) {
            return agentError('NOT_FOUND', 'Stop-loss not found');
          }
          const { code, message } = await parseApiError(res);
          return agentError(code, `Failed to remove stop-loss (HTTP ${res.status.toString()}): ${message}`);
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, message: 'Stop-loss removed', stopLossId }),
          }],
        };
      } catch (error) {
        return agentError('NETWORK_ERROR', (error as Error).message);
      }
    },
  );

  // ── stop-loss-list ───────────────────────────────────────────────────────

  server.tool(
    'stop-loss-list',
    'List all stop-loss monitors for the authenticated user. Optionally filter by status.',
    {
      status: z
        .enum(['active', 'triggered', 'stopped'])
        .optional()
        .describe('Filter by stop-loss status'),
    },
    READ_ANNOTATIONS,
    async ({ status }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const query = status ? `?status=${status}` : '';
        const res = await api.get(`${STOP_LOSS_BASE}${query}`);

        if (!res.ok) {
          const { code, message } = await parseApiError(res);
          return agentError(code, message);
        }

        const data = await res.json() as Record<string, unknown>;
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        };
      } catch (error) {
        return agentError('NETWORK_ERROR', (error as Error).message);
      }
    },
  );

  // ── stop-loss-status ─────────────────────────────────────────────────────

  server.tool(
    'stop-loss-status',
    'Get detailed status of a stop-loss monitor including trigger level and current state.',
    {
      stopLossId: z.string().uuid().describe('ID of the stop-loss'),
    },
    READ_ANNOTATIONS,
    async ({ stopLossId }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get(`${STOP_LOSS_BASE}/${stopLossId}`);

        if (!res.ok) {
          if (res.status === 404) {
            return agentError('NOT_FOUND', 'Stop-loss not found');
          }
          const { code, message } = await parseApiError(res);
          return agentError(code, message);
        }

        const data = await res.json() as Record<string, unknown>;
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        };
      } catch (error) {
        return agentError('NETWORK_ERROR', (error as Error).message);
      }
    },
  );
}
