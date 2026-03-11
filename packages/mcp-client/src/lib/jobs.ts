/**
 * In-memory job store for async blockchain & orchestration operations.
 *
 * **Short-lived jobs** (blockchain ops: token creation, bundle buys, sells)
 * take 400ms-10s. Tools return a jobId immediately and the agent polls
 * `poll-job` to get the result. These use the default 10-minute TTL.
 *
 * **Long-running orchestration jobs** (e.g., spam-launches) can set a custom
 * TTL (up to 2 hours), carry structured progress counters, and support
 * cooperative cancellation via {@link cancelJob}.
 *
 * Jobs are cleaned up by a 60-second interval based on per-job TTL
 * (capped at {@link MAX_TTL_MS}). The timer is `.unref()`'d so it does
 * not prevent the process from exiting during tests.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * A single sub-result within a multi-step orchestration job.
 *
 * For example, each iteration of a spam-launch records one SubResult
 * with the token mint, transaction status, and any error encountered.
 */
export interface SubResult {
  /** Zero-based iteration index within the orchestration run. */
  index: number;
  /** Outcome of this individual sub-step. */
  status: 'success' | 'failed' | 'skipped';
  /** Arbitrary payload (e.g., mint address, tx signature). */
  data?: unknown;
  /** Human-readable error message if status is 'failed'. */
  error?: string;
  /** ISO-8601 timestamp of when this sub-result was recorded. */
  timestamp?: string;
}

/**
 * Progress counters for a multi-step orchestration job.
 *
 * The shape intentionally mirrors the MCP `notifications/progress`
 * protocol so a future iteration can emit progress notifications
 * alongside in-memory updates.
 */
export interface JobProgress {
  /** Number of iterations completed so far. */
  current: number;
  /** Total number of iterations planned. */
  total: number;
  /** Ordered list of per-iteration results. */
  results: SubResult[];
}

/**
 * Options passed to {@link createJob} when creating a new job entry.
 */
export interface CreateJobOptions {
  /** Type label for filtering (e.g., 'spam-launches'). */
  type?: string;
  /**
   * Per-job time-to-live in milliseconds.
   * Capped at {@link MAX_TTL_MS} (2 hours). If omitted, the default
   * 10-minute TTL applies during cleanup.
   */
  ttlMs?: number;
}

/**
 * Partial update payload for {@link updateJob}.
 *
 * Only provided fields are merged. Setting `status` to a terminal value
 * auto-sets `completedAt` unless explicitly provided.
 */
export interface JobUpdate {
  status?: JobStatus;
  result?: unknown;
  error?: string;
  progress?: JobProgress;
  completedAt?: Date;
}

export interface Job {
  id: string;
  status: JobStatus;
  result?: unknown;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  // --- Orchestration fields (all optional for backward compat) ---
  /** Type label for filtering via {@link getActiveJobsByType}. */
  type?: string;
  /** Structured progress for multi-step jobs. */
  progress?: JobProgress;
  /** Per-job TTL override in ms (capped at {@link MAX_TTL_MS}). */
  ttlMs?: number;
  /** Timestamp when the job was cancelled via {@link cancelJob}. */
  cancelledAt?: Date;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Default time-to-live for jobs without a custom TTL (10 minutes). */
const DEFAULT_TTL_MS = 10 * 60 * 1000;

/** Hard cap on per-job TTL -- no job can survive longer than 2 hours. */
const MAX_TTL_MS = 2 * 60 * 60 * 1000;

/** Set of statuses that indicate a job has reached a final state. */
export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

// ── Internal store ───────────────────────────────────────────────────────────

const jobs = new Map<string, Job>();

// Cleanup jobs based on per-job TTL (capped at MAX_TTL_MS)
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const ttl = Math.min(job.ttlMs ?? DEFAULT_TTL_MS, MAX_TTL_MS);
    if (job.createdAt.getTime() + ttl < now) {
      jobs.delete(id);
    }
  }
}, 60_000).unref(); // .unref() prevents this timer from keeping the process alive in tests

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get a job by ID. Returns undefined if not found or expired.
 */
export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/**
 * Create a new job entry in the in-memory store.
 *
 * The job starts in `'pending'` status with a generated UUID id.
 * Callers should transition it to `'running'` via {@link updateJob}
 * once the actual work begins.
 *
 * @param options.type - Job type label (e.g., 'spam-launches') for filtering
 *   via {@link getActiveJobsByType}.
 * @param options.ttlMs - Per-job TTL override in ms. Capped at
 *   {@link MAX_TTL_MS} (2 hours) regardless of the value provided.
 * @returns The created {@link Job} object.
 */
export function createJob(options?: CreateJobOptions): Job {
  const id = crypto.randomUUID();
  const job: Job = {
    id,
    status: 'pending',
    createdAt: new Date(),
    type: options?.type,
    ttlMs: options?.ttlMs
      ? Math.min(options.ttlMs, MAX_TTL_MS)
      : undefined,
  };
  jobs.set(id, job);
  return job;
}

/**
 * Update a job's fields via shallow merge.
 *
 * Only the fields present in `update` are applied. When `status`
 * transitions to a terminal state (`completed`, `failed`, `cancelled`),
 * `completedAt` is auto-set to `new Date()` unless explicitly provided
 * in the update payload.
 *
 * @param id - The job ID to update.
 * @param update - Partial fields to merge into the job.
 * @returns The updated {@link Job}, or `undefined` if the job was not found.
 */
export function updateJob(id: string, update: JobUpdate): Job | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;

  if (update.status !== undefined) job.status = update.status;
  if (update.result !== undefined) job.result = update.result;
  if (update.error !== undefined) job.error = update.error;
  if (update.progress !== undefined) job.progress = update.progress;

  // Auto-set completedAt for terminal statuses
  if (update.status && TERMINAL_STATUSES.has(update.status)) {
    job.completedAt = update.completedAt ?? new Date();
  } else if (update.completedAt !== undefined) {
    job.completedAt = update.completedAt;
  }

  return job;
}

/**
 * Cancel a running or pending job cooperatively.
 *
 * Sets the job's status to `'cancelled'` and records `cancelledAt` and
 * `completedAt` timestamps. The orchestrator is expected to check
 * `getJob(id).status` between iterations and break out of its loop
 * when the status is `'cancelled'`.
 *
 * Returns `false` (no-op) if the job is not found or has already
 * reached a terminal status.
 *
 * @param id - The job ID to cancel.
 * @returns `true` if cancellation was applied, `false` otherwise.
 */
export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (TERMINAL_STATUSES.has(job.status)) return false;

  job.status = 'cancelled';
  job.cancelledAt = new Date();
  job.completedAt = new Date();
  return true;
}

/**
 * Query active (pending or running) jobs by type label.
 *
 * Used by tools to enforce concurrency limits before starting new jobs:
 * ```ts
 * const active = getActiveJobsByType('spam-launches');
 * if (active.length >= MAX_CONCURRENT) return error('CONCURRENCY_LIMIT');
 * ```
 *
 * @param type - The job type label to filter by.
 * @returns Array of matching active jobs (empty if none).
 */
export function getActiveJobsByType(type: string): Job[] {
  const active: Job[] = [];
  for (const job of jobs.values()) {
    if (job.type === type && !TERMINAL_STATUSES.has(job.status)) {
      active.push(job);
    }
  }
  return active;
}
