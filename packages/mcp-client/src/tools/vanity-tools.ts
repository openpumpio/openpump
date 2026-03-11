/**
 * Vanity address tools for the OpenPump MCP server (publishable package).
 *
 * - estimate-vanity-cost:   Estimate credit cost for a vanity address pattern
 * - order-vanity-address:   Submit a vanity address mining order
 * - list-vanity-jobs:       List the user's vanity address jobs
 * - get-vanity-job:         Get the status of a specific vanity job
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { UserContext } from '../lib/context.js';
import { createApiClient } from '../lib/api-client.js';

const DISCLAIMER = 'Not available to US persons. Use at own risk.';

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

export function registerVanityTools(server: McpServer, userContext: UserContext, apiBaseUrl: string): void {
  // ── estimate-vanity-cost ───────────────────────────────────────────────────

  server.tool(
    'estimate-vanity-cost',
    [
      'Estimate the credit cost for a vanity Solana address pattern.',
      'Cost scales exponentially with pattern length.',
      'Use this before ordering to check if you have enough credits.',
      'No credits are charged for calling this tool.',
    ].join(' '),
    {
      pattern: z
        .string()
        .min(1)
        .max(8)
        .describe(
          'The character pattern to find in the address (e.g. "PUMP", "abc"). Max 8 chars.',
        ),
      patternType: z
        .enum(['prefix', 'suffix', 'contains'])
        .default('prefix')
        .describe(
          'Where the pattern must appear: prefix (start), suffix (end), or contains (anywhere). Prefix is cheapest.',
        ),
      caseSensitive: z
        .boolean()
        .default(true)
        .describe(
          'Whether the match is case-sensitive. Case-insensitive is ~3× cheaper but finds addresses like "pump" or "PUMP" or "Pump".',
        ),
    },
    async ({ pattern, patternType, caseSensitive }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const params = new URLSearchParams({
          pattern,
          patternType,
          caseSensitive: caseSensitive.toString(),
        });
        const res = await api.get(`/api/vanity/estimate?${params.toString()}`);
        const data = await res.json() as Record<string, unknown>;

        if (!res.ok) {
          return agentError(
            'ESTIMATE_FAILED',
            `Failed to estimate cost (HTTP ${res.status.toString()}): ${JSON.stringify(data)}`,
            'Check that your pattern only uses valid base58 characters (no 0, O, I, l).',
          );
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        };
      } catch (error) {
        return agentError('ESTIMATE_ERROR', String(error));
      }
    },
  );

  // ── order-vanity-address ───────────────────────────────────────────────────

  server.tool(
    'order-vanity-address',
    [
      'Order a vanity Solana wallet address that starts with (or ends with, or contains) a custom pattern.',
      'Credits are deducted immediately. The address is mined asynchronously.',
      'Use get-vanity-job to poll for completion, then list-wallets to see the new wallet.',
      'The mined wallet will appear in your wallet list automatically when done.',
      'Cost: min 50,000 credits for short patterns, scaling exponentially with length.',
      DISCLAIMER,
    ].join(' '),
    {
      pattern: z
        .string()
        .min(1)
        .max(8)
        .describe(
          'The character pattern to embed in the address (e.g. "PUMP", "abc"). Max 8 chars.',
        ),
      patternType: z
        .enum(['prefix', 'suffix', 'contains'])
        .default('prefix')
        .describe(
          'Where the pattern must appear: prefix (start of address), suffix (end), or contains (anywhere).',
        ),
      caseSensitive: z
        .boolean()
        .default(true)
        .describe(
          'Whether the match must be exact case. Case-insensitive is cheaper but any case variant is accepted.',
        ),
      addressType: z
        .enum(['wallet', 'mint'])
        .default('wallet')
        .describe(
          'Type of address to mine: wallet (keypair address) or mint (token contract address).',
        ),
    },
    async ({ pattern, patternType, caseSensitive, addressType }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.post('/api/vanity/order', {
          pattern,
          patternType,
          caseSensitive,
          addressType,
        });
        const data = await res.json() as Record<string, unknown>;

        if (!res.ok) {
          const status = res.status;
          if (status === 402) {
            return agentError(
              'INSUFFICIENT_CREDITS',
              `Insufficient credits: ${JSON.stringify(data)}`,
              'Top up your credits via the Billing page or get-aggregate-balance to check current balance.',
            );
          }
          if (status === 422) {
            return agentError(
              'INVALID_PATTERN',
              `Invalid pattern: ${JSON.stringify(data)}`,
              'Valid chars: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz (no 0, O, I, l)',
            );
          }
          return agentError(
            'ORDER_FAILED',
            `Failed to place order (HTTP ${status.toString()}): ${JSON.stringify(data)}`,
          );
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ...data,
                note: 'Use get-vanity-job with the jobId to poll for completion.',
              }),
            },
          ],
        };
      } catch (error) {
        return agentError('ORDER_ERROR', String(error));
      }
    },
  );

  // ── list-vanity-jobs ───────────────────────────────────────────────────────

  server.tool(
    'list-vanity-jobs',
    [
      'List your vanity address mining jobs (newest first).',
      'Shows status: pending (queued), running (being mined), completed (wallet added), failed.',
      'Completed jobs include the wallet ID and public key of the generated address.',
    ].join(' '),
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Maximum number of jobs to return.'),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe('Pagination offset.'),
    },
    async ({ limit, offset }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString(),
        });
        const res = await api.get(`/api/vanity/jobs?${params.toString()}`);
        const data = await res.json() as Record<string, unknown>;

        if (!res.ok) {
          return agentError(
            'LIST_JOBS_FAILED',
            `Failed to list jobs (HTTP ${res.status.toString()}): ${JSON.stringify(data)}`,
          );
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        };
      } catch (error) {
        return agentError('LIST_JOBS_ERROR', String(error));
      }
    },
  );

  // ── get-vanity-job ─────────────────────────────────────────────────────────

  server.tool(
    'get-vanity-job',
    [
      'Get the status of a specific vanity address mining job.',
      'Poll this after placing an order to check if the address has been found.',
      'When status is "completed", the wallet is already in your wallet list.',
    ].join(' '),
    {
      jobId: z.string().uuid().describe('The vanity job ID returned by order-vanity-address.'),
    },
    async ({ jobId }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get(`/api/vanity/jobs/${jobId}`);
        const data = await res.json() as Record<string, unknown>;

        if (!res.ok) {
          if (res.status === 404) {
            return agentError('JOB_NOT_FOUND', 'Vanity job not found.', 'Check the jobId.');
          }
          return agentError(
            'GET_JOB_FAILED',
            `Failed to get job (HTTP ${res.status.toString()}): ${JSON.stringify(data)}`,
          );
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data) }],
        };
      } catch (error) {
        return agentError('GET_JOB_ERROR', String(error));
      }
    },
  );
}
