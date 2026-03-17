/**
 * OPENPUMP_VANITY_LIST action — List vanity address mining jobs.
 *
 * Calls GET /api/vanity/jobs on the OpenPump REST API.
 * Shows status: pending, running, completed, or failed.
 */
import type { Action, ActionResult, IAgentRuntime, Memory, State, HandlerOptions, HandlerCallback } from '@elizaos/core';
import { getClient } from '../plugin.js';

export const vanityListAction: Action = {
  name: 'OPENPUMP_VANITY_LIST',
  similes: ['VANITY_LIST', 'LIST_VANITY_JOBS', 'SHOW_VANITY_ORDERS', 'MY_VANITY_WALLETS'],
  description:
    'List vanity address mining jobs. Shows status (pending, running, completed, failed) ' +
    'and wallet details for completed jobs.',

  examples: [
    [
      { name: 'user', content: { text: 'Show my vanity wallet orders' } },
      { name: 'agent', content: { text: 'Fetching your vanity address jobs...' } },
    ],
    [
      { name: 'user', content: { text: 'Check status of my vanity address' } },
      { name: 'agent', content: { text: 'Looking up vanity address mining progress...' } },
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
      const limit = content['limit'] as number | undefined;
      const offset = content['offset'] as number | undefined;

      let path = '/api/vanity/jobs';
      const params: string[] = [];
      if (limit !== undefined) params.push(`limit=${String(limit)}`);
      if (offset !== undefined) params.push(`offset=${String(offset)}`);
      if (params.length > 0) path += `?${params.join('&')}`;

      const res = await client.get(path);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `Failed to list vanity jobs (HTTP ${String(res.status)}): ${errText}`;
        if (callback) await callback({ text: errorMsg, actions: ['OPENPUMP_VANITY_LIST'] });
        return { success: false, error: errorMsg };
      }

      const data = (await res.json()) as {
        data: Array<Record<string, unknown>>;
      };
      const jobs = data.data ?? [];

      if (jobs.length === 0) {
        const msg = 'No vanity address jobs found.';
        if (callback) await callback({ text: msg, actions: ['OPENPUMP_VANITY_LIST'] });
        return { success: true, text: msg, data: { jobs: [] } };
      }

      const lines: string[] = [`Vanity Address Jobs (${String(jobs.length)}):`];
      for (const job of jobs) {
        const id = typeof job['id'] === 'string' ? job['id'] : String(job['id'] ?? '');
        const st = typeof job['status'] === 'string' ? job['status'] : 'unknown';
        const pattern = typeof job['pattern'] === 'string' ? job['pattern'] : '';
        const publicKey = typeof job['publicKey'] === 'string' ? ` -> ${job['publicKey']}` : '';
        lines.push(`  - ${id}: ${st} (pattern: "${pattern}"${publicKey})`);
      }

      const successMsg = lines.join('\n');
      if (callback) await callback({ text: successMsg, actions: ['OPENPUMP_VANITY_LIST'] });
      return { success: true, text: successMsg, data: { jobs } };
    } catch (error) {
      const errMsg = `Vanity job list failed: ${error instanceof Error ? error.message : String(error)}`;
      if (callback) await callback({ text: errMsg, actions: ['OPENPUMP_VANITY_LIST'] });
      return { success: false, error: errMsg };
    }
  },
};
