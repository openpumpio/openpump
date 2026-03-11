/**
 * Job polling and cancellation tools for the OpenPump MCP server.
 *
 * poll-job:   Check the status of an async operation (blockchain ops + orchestration jobs).
 *             Agents should poll every 2–5 seconds until status is "completed", "failed", or "cancelled".
 *             Jobs expire after 10 minutes (orchestration jobs may have longer TTLs).
 *
 * cancel-job: Cancel a running orchestration job (e.g., spam-launches).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getJob, cancelJob } from '../lib/jobs.js';
import type { UserContext } from '../lib/context.js';
import { createApiClient } from '../lib/api-client.js';

/**
 * Build an agent-readable error response.
 * Never sets `isError: true` on the MCP result -- domain errors are
 * communicated via the JSON payload so the agent can act on them.
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
 * Register the poll-job and cancel-job tools.
 * These tools have no legal disclaimer -- they are meta operations, not trading actions.
 */
export function registerJobTools(server: McpServer, userContext: UserContext, apiBaseUrl: string): void {
  server.tool(
    'poll-job',
    'Check the status of an async operation (create-token, bundle-launch, bundle-buy, buy-token, sell-token, claim-creator-fees, transfer-sol, transfer-token, spam-launches). ' +
      'Call repeatedly until status is "completed", "failed", or "cancelled". ' +
      'Suggested polling interval: 2 seconds (5 seconds for spam-launches). ' +
      'Jobs expire after 10 minutes (orchestration jobs may have longer TTLs).',
    {
      jobId: z
        .string()
        .describe('Job ID returned by a previous async tool call'),
    },
    async ({ jobId }) => {
      // First check the MCP in-memory store (used by create-token and other sync-wrapped async ops)
      const memJob = getJob(jobId);
      if (memJob) {
        const response: {
          jobId: string;
          status: string;
          result: unknown;
          error: string | null;
          createdAt: string;
          completedAt: string | null;
          hint?: string;
          progress?: {
            current: number;
            total: number;
            succeeded: number;
            failed: number;
          };
        } = {
          jobId: memJob.id,
          status: memJob.status,
          result: memJob.result ?? null,
          error: memJob.error ?? null,
          createdAt: memJob.createdAt.toISOString(),
          completedAt: memJob.completedAt?.toISOString() ?? null,
        };

        // Include compact progress summary when available (orchestration jobs)
        if (memJob.progress) {
          response.progress = {
            current: memJob.progress.current,
            total: memJob.progress.total,
            succeeded: memJob.progress.results.filter((r) => r.status === 'success').length,
            failed: memJob.progress.results.filter((r) => r.status === 'failed').length,
          };
        }

        // Contextual hints based on job status and progress
        if (memJob.status === 'cancelled') {
          response.hint = 'Job was cancelled. Partial results are available in progress.';
        } else if (memJob.status === 'running' && memJob.progress) {
          response.hint = `Job in progress: ${memJob.progress.current}/${memJob.progress.total} tokens created. Poll again in 5 seconds.`;
        } else if (memJob.status === 'pending' || memJob.status === 'running') {
          response.hint = 'Job is still processing. Poll again in 2 seconds.';
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(response) }] };
      }

      // Fall back to the API BullMQ job store (used by bundle-launch)
      try {
        const api = createApiClient(userContext.apiKey, apiBaseUrl);
        const res = await api.get(`/api/jobs/${jobId}`);
        if (res.ok) {
          const data: unknown = await res.json();
          return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
        }
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
        const errBody = await res.text();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: true, code: 'API_ERROR', message: errBody }),
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
                code: 'JOB_NOT_FOUND',
                message: `Job "${jobId}" was not found.`,
                detail: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        };
      }
    },
  );

  // ── cancel-job ──────────────────────────────────────────────────────────────

  server.tool(
    'cancel-job',
    'Cancel a running async orchestration job (e.g., spam-launches). ' +
      'The job will stop after completing its current operation. ' +
      'Already-completed sub-operations are preserved in the job progress.',
    {
      jobId: z
        .string()
        .describe('Job ID of the running orchestration job to cancel'),
    },
    async ({ jobId }) => {
      const success = cancelJob(jobId);
      if (success) {
        const job = getJob(jobId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                cancelled: true,
                jobId,
                progress: job?.progress
                  ? {
                      current: job.progress.current,
                      total: job.progress.total,
                      succeeded: job.progress.results.filter((r) => r.status === 'success').length,
                      failed: job.progress.results.filter((r) => r.status === 'failed').length,
                    }
                  : null,
                message: 'Job cancellation requested. The job will stop after its current operation.',
              }),
            },
          ],
        };
      }
      return agentError(
        'CANCEL_FAILED',
        `Job "${jobId}" not found or already in a terminal state.`,
        'Use poll-job to check the current status of the job.',
      );
    },
  );
}
