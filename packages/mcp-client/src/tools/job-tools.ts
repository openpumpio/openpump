/**
 * Job polling tool for the OpenPump MCP server (publishable package version).
 *
 * Unlike apps/mcp which uses an in-memory job store, this version polls
 * the REST API at GET /api/jobs/:jobId to check async operation status.
 *
 * poll-job: Check the status of an async blockchain operation.
 * Agents should poll every 2-5 seconds until status is "completed" or "failed".
 * Jobs expire after 10 minutes.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createApiClient } from '../lib/api-client.js';
import type { UserContext } from '../lib/context.js';

/**
 * Register the poll-job tool.
 * This tool has no legal disclaimer -- it is a meta operation, not a trading action.
 */
export function registerJobTools(server: McpServer, userContext: UserContext, apiBaseUrl: string): void {
  server.tool(
    'poll-job',
    'Check the status of an async operation (create-token, bundle-buy, buy-token, sell-token, claim-creator-fees, transfer-sol, transfer-token). ' +
      'Call repeatedly until status is "completed" or "failed". ' +
      'Suggested polling interval: 2 seconds. ' +
      'Jobs expire after 10 minutes.',
    {
      jobId: z
        .string()
        .describe('Job ID returned by a previous async tool call'),
    },
    async ({ jobId }) => {
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get(`/api/jobs/${jobId}`);

        if (res.status === 404) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: true,
                  code: 'JOB_NOT_FOUND',
                  message: `Job "${jobId}" was not found. It may have expired or the ID is incorrect.`,
                  suggestion: 'Verify the jobId from a recent async tool call. Jobs expire after 10 minutes.',
                }),
              },
            ],
          };
        }

        if (!res.ok) {
          const errBody = await res.text();
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: true,
                  code: 'API_ERROR',
                  message: `Failed to fetch job status (HTTP ${res.status.toString()}): ${errBody}`,
                  suggestion: 'Try again in a few seconds.',
                }),
              },
            ],
          };
        }

        const data = (await res.json()) as {
          jobId: string;
          status: string;
          progress?: number;
          result?: unknown;
          warnings?: string[];
          error?: string;
        };

        const response: {
          jobId: string;
          status: string;
          progress?: number;
          result: unknown;
          warnings?: string[];
          error: string | null;
          hint?: string;
        } = {
          jobId: data.jobId,
          status: data.status,
          progress: data.progress,
          result: data.result ?? null,
          warnings: data.warnings,
          error: data.error ?? null,
        };

        if (data.status === 'pending' || data.status === 'running' || data.status === 'active' || data.status === 'waiting') {
          response.hint = 'Job is still processing. Poll again in 2 seconds.';
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(response),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: true,
                code: 'API_ERROR',
                message: `Job poll request failed: ${error instanceof Error ? error.message : String(error)}`,
                suggestion: 'Try again in a few seconds.',
              }),
            },
          ],
        };
      }
    },
  );
}
