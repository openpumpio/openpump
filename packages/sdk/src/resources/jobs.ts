import type { HttpClient } from '../http.js';

export interface JobStatus {
  jobId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number;
  result?: {
    bundleStatuses: Array<{
      bundleId: string;
      status: 'Pending' | 'Landed' | 'Failed' | 'Timeout';
      signatures?: string[];
    }>;
  };
  warnings?: Array<{ walletId: string; reason: string }>;
  error?: string;
}

export interface PollOptions {
  /** Polling interval in milliseconds. Default: 1000 */
  intervalMs?: number;
  /** Maximum time to wait in milliseconds. Default: 30000 */
  timeoutMs?: number;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Callback invoked on each poll with current status. */
  onProgress?: (status: JobStatus) => void;
}

export class Jobs {
  constructor(private readonly _http: HttpClient) {}

  /** Get the current status of a job. */
  async get(jobId: string): Promise<JobStatus> {
    return this._http.get<JobStatus>(`/api/jobs/${jobId}`);
  }

  /**
   * Poll a job until it completes or the timeout is reached.
   *
   * @param jobId - The job ID to poll.
   * @param options - Polling configuration.
   * @returns The final job status (completed).
   * @throws {Error} If the job fails or the timeout is reached.
   *
   * @example
   * ```ts
   * const launch = await op.bundles.launch({ ... });
   * const result = await op.jobs.poll(launch.jobId, {
   *   intervalMs: 2000,
   *   timeoutMs: 60000,
   *   onProgress: (s) => console.log(`Progress: ${s.progress}%`),
   * });
   * ```
   */
  async poll(jobId: string, options?: PollOptions): Promise<JobStatus> {
    const intervalMs = options?.intervalMs ?? 1000;
    const timeoutMs = options?.timeoutMs ?? 30_000;
    const signal = options?.signal;
    const onProgress = options?.onProgress;

    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (signal?.aborted) {
        throw new Error('Job polling aborted');
      }

      const status = await this.get(jobId);
      onProgress?.(status);

      if (status.status === 'completed') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(status.error ?? `Job ${jobId} failed`);
      }

      // Wait before next poll
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, intervalMs);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new Error('Job polling aborted'));
          },
          { once: true },
        );
      });
    }

    throw new Error(`Job ${jobId} polling timed out after ${timeoutMs}ms`);
  }
}
