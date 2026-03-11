/**
 * Spam launch tools for the OpenPump MCP server (publishable package).
 *
 * - spam-launch:         Async orchestrator that creates up to 100 pump.fun tokens
 *                        sequentially with configurable delays, error handling,
 *                        and cancellation support. Returns a jobId immediately;
 *                        agents poll progress via `poll-job`.
 *
 * - estimate-spam-cost:  Synchronous cost calculator (pure math, no API call)
 *                        that returns a breakdown of SOL and credit costs for
 *                        a planned spam launch.
 *
 * - cancel-spam-launch:  Cancels a running spam-launch job via AbortController.
 *                        Tokens already created remain on-chain.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { UserContext } from '../lib/context.js';
import { createApiClient } from '../lib/api-client.js';
import type { ApiClient } from '../lib/api-client.js';
import { createJob, updateJob, cancelJob, getJob, getActiveJobsByType } from '../lib/jobs.js';
import type { Job } from '../lib/jobs.js';

// ── Constants ────────────────────────────────────────────────────────────────

const DISCLAIMER = 'Not available to US persons. Use at own risk.';

const RICO_WARNING =
  'LEGAL DISCLAIMER: Automated batch token creation may be subject to legal restrictions in your jurisdiction. ' +
  'A RICO lawsuit (Case 1:25-cv-00880-CM, $5.5B class action) is active against pump.fun-related services. ' +
  'By setting confirm=true you acknowledge awareness of these risks. ' +
  DISCLAIMER;

/** Maximum consecutive creation failures before the circuit breaker trips. */
const MAX_CONSECUTIVE_FAILURES = 5;

/** Maximum delay ceiling for exponential backoff (30 seconds). */
const MAX_DELAY_MS = 30_000;

const SPAM_LAUNCH_DESCRIPTION = [
  RICO_WARNING,
  'Create multiple PumpFun tokens in rapid succession from a single wallet.',
  'Tokens are created sequentially with a configurable delay between each.',
  'Returns a jobId immediately -- use poll-job to track progress (suggested interval: 5 seconds).',
  'COST WARNING: Each token costs platform credits (50,000 per create) plus network fees plus optional initial buy SOL.',
  'Pump.fun creation fee is 0 SOL as of October 2025.',
  'Always run estimate-spam-cost before this tool to verify sufficient balance.',
  'Naming: Use {i} in nameTemplate and symbolTemplate for sequential numbering (1-indexed).',
  'Image: If imageUrl is provided, the image is fetched and uploaded to IPFS once, then reused for all tokens.',
  'Failure handling: failureMode controls whether the job stops, skips, or retries on individual token failures.',
  'Circuit breaker: Job auto-stops after 5 consecutive failures.',
  'Jobs are stored in-memory. If the MCP server restarts, running jobs are lost. Already-created tokens remain on-chain.',
  'Requires confirm: true to execute.',
].join(' ');

// ── Interfaces ───────────────────────────────────────────────────────────────

/** Progress snapshot for a running or completed spam-launch job. */
interface SpamLaunchProgress {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  currentIndex: number;
  startedAt: string;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  avgTimePerTokenMs: number | null;
  tokens: TokenResult[];
  errors: TokenError[];
  consecutiveFailures: number;
  stoppedReason?: 'completed' | 'cancelled' | 'max_consecutive_failures' | 'insufficient_balance' | 'fatal_error';
  config: {
    failureMode: 'stop' | 'skip' | 'retry';
    maxConsecutiveFailures: number;
    delayMs: number;
  };
}

/** Record of a successfully created token within a spam-launch. */
interface TokenResult {
  index: number;
  mint: string;
  txSignature: string;
  name: string;
  symbol: string;
  createdAt: string;
}

/** Record of a failed token creation attempt within a spam-launch. */
interface TokenError {
  index: number;
  error: string;
  code: string;
  retriesAttempted: number;
  timestamp: string;
}

/** Cached image data (fetched once, reused for all tokens in the batch). */
interface CachedImage {
  base64: string;
  type: 'image/png' | 'image/jpeg' | 'image/jpg' | 'image/gif' | 'image/webp';
}

/** Internal config passed to the creation loop. */
interface SpamLaunchConfig {
  walletId: string;
  count: number;
  delayMs: number;
  nameTemplate: string;
  symbolTemplate: string;
  description: string;
  imageUrl?: string;
  initialBuyAmountSol?: number;
  failureMode: 'stop' | 'skip' | 'retry';
  priorityLevel: 'economy' | 'normal' | 'fast' | 'turbo';
}

// ── Module-level state ───────────────────────────────────────────────────────

/** Maps jobId to its AbortController for cooperative cancellation. */
const abortControllers = new Map<string, AbortController>();


// ── Helper functions ─────────────────────────────────────────────────────────

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
 * Replace `{i}` placeholders in a template with the 1-based index.
 *
 * @example applyTemplate('Token #{i}', 3) // 'Token #3'
 */
export function applyTemplate(template: string, index: number): string {
  return template.replaceAll('{i}', String(index));
}

/**
 * Validate that the longest possible template expansion fits within `maxLen`.
 * Returns an error message string if invalid, or `null` if valid.
 */
export function validateTemplate(template: string, maxIndex: number, maxLen: number): string | null {
  const longest = applyTemplate(template, maxIndex);
  if (longest.length > maxLen) {
    return `Template "${template}" expands to ${longest.length} chars at index ${maxIndex} (max: ${maxLen}). Shorten the template.`;
  }
  return null;
}

/**
 * Validate that an imageUrl is safe to fetch (SSRF guard):
 * - Must be https: scheme only
 * - Must not point to a private/internal IP or hostname
 *
 * @throws Error if any check fails
 */
function validateImageUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid imageUrl: not a valid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Invalid imageUrl: must use https');
  }
  const host = parsed.hostname.toLowerCase();
  const blocked = [
    /^localhost$/,
    /^127\./,
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
  ];
  if (blocked.some((re) => re.test(host))) {
    throw new Error('Invalid imageUrl: private or internal addresses are not allowed');
  }
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

  const lower = imageUrl.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';

  return 'image/png';
}

/**
 * Fetch an image from a URL and return its base64 representation + MIME type.
 * The result is cached in-memory and reused for all tokens in the batch.
 *
 * @throws Error if URL validation fails, fetch fails, or image is too large
 */
async function fetchAndCacheImage(url: string): Promise<CachedImage> {
  validateImageUrl(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Image fetch failed: HTTP ${res.status}`);

  const contentType = res.headers.get('content-type');
  const type = detectImageMimeType(contentType, url);
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  return { base64, type };
}

/**
 * Sleep for `ms` milliseconds, resolving early if the AbortSignal fires.
 * Resolves (does not reject) on abort so callers check `signal.aborted` themselves.
 */
function cancellableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Returns true for HTTP status codes that indicate a transient/retriable error. */
export function isTransientError(status: number): boolean {
  return status === 429 || status === 503 || status >= 500;
}

/** Returns true for HTTP status codes that indicate a permanent/non-retriable error. */
export function isPermanentError(status: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 422;
}

/** Returns true if the error indicates insufficient SOL or credit balance. */
export function isInsufficientBalance(status: number, message: string): boolean {
  return status === 402 || (status === 400 && message.toUpperCase().includes('INSUFFICIENT'));
}

// ── Cost estimate (shared by estimate-spam-cost tool and confirm=false path) ─

/**
 * Compute a detailed cost estimate for a spam-launch operation.
 * Pure math -- no API calls, no side effects.
 *
 * @param count              - Number of tokens to create (1-100)
 * @param initialBuyAmountSol - Optional SOL for dev initial buy per token
 * @param priorityLevel      - Transaction priority tier
 * @returns Structured cost breakdown with warnings
 */
export function computeSpamCostEstimate(
  count: number,
  initialBuyAmountSol: number,
  priorityLevel: string,
): Record<string, unknown> {
  const NETWORK_FEE_PER_TX = 5000n;
  const TOKEN_ACCOUNT_RENT = 2_049_280n;
  const CREATION_FEE = 0n; // pump.fun creation fee is 0 SOL as of Oct 2025
  const APPROX_PRIORITY_FEES: Record<string, bigint> = {
    economy: 10_000n,
    normal: 50_000n,
    fast: 200_000n,
    turbo: 1_000_000n,
  };

  const countBI = BigInt(count);
  const networkFees = countBI * NETWORK_FEE_PER_TX;
  const rentFees = countBI * TOKEN_ACCOUNT_RENT;
  const creationFees = countBI * CREATION_FEE;
  const priorityFees = countBI * (APPROX_PRIORITY_FEES[priorityLevel] ?? APPROX_PRIORITY_FEES['economy']!);
  const initialBuyLamports = BigInt(Math.round(initialBuyAmountSol * 1_000_000_000)) * countBI;

  const totalLamports = networkFees + rentFees + creationFees + priorityFees + initialBuyLamports;

  const totalCredits = count * 50_000;
  const totalCreditsCostUsd = (totalCredits / 1_000_000) * 5; // $5 per 1M credits

  const warnings: string[] = [];
  if (initialBuyAmountSol > 0.5) {
    warnings.push(
      `High initialBuyAmountSol (${initialBuyAmountSol} SOL per token). Total initial buy: ${(initialBuyAmountSol * count).toFixed(4)} SOL.`,
    );
  }
  if (count >= 50) {
    warnings.push(
      `Large batch (${count} tokens). Total job duration: ~${Math.ceil((count * 5) / 60)} minutes at 2s delay.`,
    );
  }

  return {
    totalLamports: totalLamports.toString(),
    totalSolApprox: (Number(totalLamports) / 1_000_000_000).toFixed(9),
    breakdown: {
      networkFeesLamports: networkFees.toString(),
      tokenAccountRentLamports: rentFees.toString(),
      creationFeesLamports: creationFees.toString(),
      priorityFeesLamports: priorityFees.toString(),
      initialBuysLamports: initialBuyLamports.toString(),
    },
    perTokenCost: {
      networkFee: (Number(NETWORK_FEE_PER_TX) / 1_000_000_000).toFixed(9),
      tokenAccountRent: (Number(TOKEN_ACCOUNT_RENT) / 1_000_000_000).toFixed(9),
      initialBuy: initialBuyAmountSol.toFixed(9),
    },
    credits: {
      totalCredits,
      totalCreditsCostUsd: totalCreditsCostUsd.toFixed(2),
      perTokenCredits: 50_000,
    },
    warnings,
    note: `Estimates for ${count} tokens with ${priorityLevel} priority. Actual costs may vary by ~20%. Credit cost: $${totalCreditsCostUsd.toFixed(2)}.`,
  };
}

// ── Creation loop ────────────────────────────────────────────────────────────

/**
 * Core loop for the spam-launch orchestrator.
 *
 * Creates `config.count` tokens sequentially, updating job progress after
 * each iteration. Supports configurable failure modes (stop/skip/retry),
 * a circuit breaker (5 consecutive failures), adaptive delay with
 * exponential backoff on 429s, and cooperative cancellation via AbortSignal.
 *
 * @param api    - Authenticated API client for the REST API
 * @param config - Spam launch configuration
 * @param job    - Job store entry for progress tracking
 * @param signal - AbortSignal for cooperative cancellation
 */
async function runSpamLaunchLoop(
  api: ApiClient,
  config: SpamLaunchConfig,
  job: Job,
  signal: AbortSignal,
): Promise<void> {
  const startedAt = new Date();
  const progress: SpamLaunchProgress = {
    total: config.count,
    completed: 0,
    failed: 0,
    skipped: 0,
    currentIndex: 0,
    startedAt: startedAt.toISOString(),
    elapsedMs: 0,
    estimatedRemainingMs: null,
    avgTimePerTokenMs: null,
    tokens: [],
    errors: [],
    consecutiveFailures: 0,
    config: {
      failureMode: config.failureMode,
      maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
      delayMs: config.delayMs,
    },
  };

  updateJob(job.id, { status: 'running', result: progress });

  // Pre-fetch and cache image if provided
  let cachedImage: CachedImage | null = null;
  if (config.imageUrl) {
    try {
      cachedImage = await fetchAndCacheImage(config.imageUrl);
    } catch (error) {
      updateJob(job.id, {
        status: 'failed',
        error: `Failed to fetch image: ${error instanceof Error ? error.message : String(error)}`,
        result: progress,
      });
      return;
    }
  }

  // Resolve wallet index from API
  let walletIndex: number;
  try {
    const walletRes = await api.get(`/api/wallets/${config.walletId}`);
    if (!walletRes.ok) {
      updateJob(job.id, {
        status: 'failed',
        error: `Failed to resolve wallet ${config.walletId}: HTTP ${walletRes.status}`,
        result: progress,
      });
      return;
    }
    const walletData = (await walletRes.json()) as { index: number };
    walletIndex = walletData.index;
  } catch (error) {
    updateJob(job.id, {
      status: 'failed',
      error: `Failed to resolve wallet: ${error instanceof Error ? error.message : String(error)}`,
      result: progress,
    });
    return;
  }

  let currentDelay = config.delayMs;

  for (let i = 0; i < config.count; i++) {
    // 1. Check cancellation
    if (signal.aborted) {
      progress.stoppedReason = 'cancelled';
      updateJob(job.id, { status: 'cancelled', result: progress });
      return;
    }

    // 2. Check circuit breaker
    if (progress.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      progress.stoppedReason = 'max_consecutive_failures';
      updateJob(job.id, {
        status: 'failed',
        error: `Stopped after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`,
        result: progress,
      });
      return;
    }

    progress.currentIndex = i + 1;

    // 3. Generate token metadata
    const tokenName = applyTemplate(config.nameTemplate, i + 1);
    const tokenSymbol = applyTemplate(config.symbolTemplate, i + 1);

    // 4. Create token via API
    let retries = 0;
    const maxRetries = config.failureMode === 'retry' ? 3 : 0;
    let succeeded = false;

    while (retries <= maxRetries) {
      try {
        const body: Record<string, unknown> = {
          walletIndex,
          name: tokenName,
          symbol: tokenSymbol,
          description: config.description,
          priorityLevel: config.priorityLevel,
        };
        if (cachedImage) {
          body['imageBase64'] = cachedImage.base64;
          body['imageType'] = cachedImage.type;
        }
        if (config.initialBuyAmountSol && config.initialBuyAmountSol > 0) {
          body['initialBuyAmountSol'] = config.initialBuyAmountSol;
        }

        const res = await api.post('/api/tokens/create', body);

        if (!res.ok) {
          const status = res.status;
          const errText = await res.text();

          // Insufficient balance -- abort immediately
          if (isInsufficientBalance(status, errText)) {
            progress.stoppedReason = 'insufficient_balance';
            progress.errors.push({
              index: i + 1,
              error: errText,
              code: 'INSUFFICIENT_BALANCE',
              retriesAttempted: retries,
              timestamp: new Date().toISOString(),
            });
            progress.failed++;
            updateJob(job.id, {
              status: 'failed',
              error: `Insufficient balance at token ${i + 1}/${config.count}`,
              result: progress,
            });
            return;
          }

          // Transient error with retries remaining
          if (isTransientError(status) && retries < maxRetries) {
            retries++;
            currentDelay = Math.min(currentDelay * 2, MAX_DELAY_MS);
            await cancellableDelay(currentDelay, signal);
            continue;
          }

          // Permanent error or retries exhausted
          progress.errors.push({
            index: i + 1,
            error: errText,
            code: isPermanentError(status) ? 'PERMANENT_ERROR' : 'TRANSIENT_ERROR',
            retriesAttempted: retries,
            timestamp: new Date().toISOString(),
          });
          progress.failed++;
          progress.consecutiveFailures++;

          if (config.failureMode === 'stop') {
            progress.stoppedReason = 'fatal_error';
            updateJob(job.id, {
              status: 'failed',
              error: `Stopped on error at token ${i + 1}: ${errText}`,
              result: progress,
            });
            return;
          }
          break; // skip this token, continue loop
        }

        // Success path
        const data = (await res.json()) as { mint?: string; txSignature?: string; signature?: string };

        progress.tokens.push({
          index: i + 1,
          mint: data.mint ?? '',
          txSignature: data.txSignature ?? data.signature ?? '',
          name: tokenName,
          symbol: tokenSymbol,
          createdAt: new Date().toISOString(),
        });
        progress.completed++;
        progress.consecutiveFailures = 0;
        succeeded = true;

        // Adaptive delay: decay on success back towards the floor
        currentDelay = Math.max(currentDelay * 0.8, config.delayMs);
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Network-level error with retries remaining
        if (retries < maxRetries) {
          retries++;
          currentDelay = Math.min(currentDelay * 2, MAX_DELAY_MS);
          await cancellableDelay(currentDelay, signal);
          continue;
        }

        // Retries exhausted or no retries
        progress.errors.push({
          index: i + 1,
          error: message,
          code: 'NETWORK_ERROR',
          retriesAttempted: retries,
          timestamp: new Date().toISOString(),
        });
        progress.failed++;
        progress.consecutiveFailures++;

        if (config.failureMode === 'stop') {
          progress.stoppedReason = 'fatal_error';
          updateJob(job.id, {
            status: 'failed',
            error: `Stopped on error at token ${i + 1}: ${message}`,
            result: progress,
          });
          return;
        }
        break; // skip this token, continue loop
      }
    }

    // Track skipped tokens (failed but not counted as succeeded)
    if (!succeeded && config.failureMode !== 'stop') {
      progress.skipped++;
    }

    // Update progress timing
    progress.elapsedMs = Date.now() - startedAt.getTime();
    const processedCount = progress.completed + progress.failed;
    if (processedCount > 0) {
      progress.avgTimePerTokenMs = Math.round(progress.elapsedMs / processedCount);
      const remaining = progress.total - progress.currentIndex;
      progress.estimatedRemainingMs = Math.round(progress.avgTimePerTokenMs * remaining);
    }

    // Persist progress
    updateJob(job.id, { result: progress });

    // Delay between iterations (skip delay after last token)
    if (i < config.count - 1) {
      await cancellableDelay(currentDelay, signal);
    }
  }

  // Loop completed normally
  progress.stoppedReason = 'completed';
  updateJob(job.id, { status: 'completed', result: progress });
}

// ── Tool registration ────────────────────────────────────────────────────────

/**
 * Register all spam launch tools onto the given McpServer.
 *
 * Tools registered:
 * - `spam-launch`         -- async batch token creator
 * - `estimate-spam-cost`  -- synchronous cost calculator
 * - `cancel-spam-launch`  -- cooperative job cancellation
 *
 * @param server      - The McpServer instance to register tools on
 * @param userContext - Authenticated user context (provides apiKey, wallets)
 * @param apiBaseUrl  - Base URL of the REST API
 */
export function registerSpamTools(server: McpServer, userContext: UserContext, apiBaseUrl: string): void {
  // ── spam-launch ──────────────────────────────────────────────────────────

  server.tool(
    'spam-launch',
    SPAM_LAUNCH_DESCRIPTION,
    {
      walletId: z
        .string()
        .describe(
          'ID of the wallet that pays for token creation and optional initial buys. Use list-wallets to see available wallet IDs.',
        ),

      count: z
        .number()
        .int()
        .min(1)
        .max(100)
        .describe('Number of tokens to create (1-100). Total SOL cost scales linearly: run estimate-spam-cost first.'),

      delayMs: z
        .number()
        .int()
        .min(500)
        .max(60_000)
        .default(2000)
        .describe(
          'Milliseconds to wait between each token creation (default: 2000). ' +
            'Minimum 500ms to avoid rate limits. Higher values reduce RPC pressure but increase total job duration. ' +
            'At 2000ms with 100 tokens, expect ~3-4 minutes total.',
        ),

      nameTemplate: z
        .string()
        .max(32)
        .default('Token #{i}')
        .describe(
          'Name template for each token. Use {i} for the 1-based index (e.g. "SpamToken #{i}" produces "SpamToken #1", "SpamToken #2", ...). ' +
            'If {i} is omitted, all tokens share the same name. Max 32 chars after substitution.',
        ),

      symbolTemplate: z
        .string()
        .max(10)
        .default('TKN{i}')
        .describe(
          'Symbol template for each token. Use {i} for the 1-based index (e.g. "SPAM{i}" produces "SPAM1", "SPAM2", ...). ' +
            'If {i} is omitted, all tokens share the same symbol. Max 10 chars after substitution.',
        ),

      description: z
        .string()
        .max(500)
        .default('Created via OpenPump spam-launch')
        .describe('Static description applied to all tokens (max 500 chars). Same description is reused for every token.'),

      imageUrl: z
        .string()
        .url()
        .optional()
        .describe(
          'Publicly accessible HTTPS image URL reused for all tokens. ' +
            'Image is fetched once and uploaded to IPFS once, then the same metadata URI is used for every token. ' +
            'Omit to create tokens without an image.',
        ),

      initialBuyAmountSol: z
        .number()
        .min(0)
        .optional()
        .describe(
          'Optional SOL amount for a dev initial buy on each token (e.g. 0.01 = 0.01 SOL per token). ' +
            'Total initial buy cost = this value * count. Set to 0 or omit for no initial buy.',
        ),

      failureMode: z
        .enum(['stop', 'skip', 'retry'])
        .default('skip')
        .describe(
          'How to handle individual token creation failures: ' +
            '"stop" = abort the entire job on first failure, ' +
            '"skip" = log the failure and continue to the next token, ' +
            '"retry" = retry the failed token up to 3 times before skipping. ' +
            'Default: "skip".',
        ),

      priorityLevel: z
        .enum(['economy', 'normal', 'fast', 'turbo'])
        .default('economy')
        .describe(
          'Transaction priority tier for each token creation. ' +
            "Default: 'economy' (lowest fee, suitable for non-time-sensitive batch operations). " +
            "Maps to Jito tip percentiles: 'economy' (25th), 'normal' (50th), 'fast' (75th), 'turbo' (95th).",
        ),

      confirm: z
        .boolean()
        .describe(
          'REQUIRED: Must be true to execute. Run estimate-spam-cost first to see total SOL required. ' +
            'Setting confirm=true acknowledges the RICO/legal risks and total cost.',
        ),
    },
    async ({
      walletId,
      count,
      delayMs,
      nameTemplate,
      symbolTemplate,
      description,
      imageUrl,
      initialBuyAmountSol,
      failureMode,
      priorityLevel,
      confirm,
    }) => {
      // Confirm gate: when false, return cost estimate without executing
      if (!confirm) {
        const estimate = computeSpamCostEstimate(count, initialBuyAmountSol ?? 0, priorityLevel);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                confirm: false,
                message: 'Spam launch NOT executed. Review the cost estimate below and set confirm=true to proceed.',
                estimate,
                ricoWarning: RICO_WARNING,
                suggestion: 'Call estimate-spam-cost for a detailed breakdown, then call spam-launch with confirm=true.',
              }),
            },
          ],
        };
      }

      // Concurrency guard: max 1 active spam-launch job
      const activeJobs = getActiveJobsByType('spam-launch');
      if (activeJobs.length > 0) {
        const runningId = activeJobs[0]!.id;
        return agentError(
          'SPAM_LAUNCH_ALREADY_RUNNING',
          `A spam-launch job is already running (${runningId}).`,
          'Wait for it to complete, cancel it with cancel-spam-launch, or poll its status with poll-job.',
        );
      }

      // Validate wallet belongs to this user
      const wallet = userContext.wallets.find((w) => w.id === walletId);
      if (!wallet) {
        return agentError(
          'WALLET_NOT_FOUND',
          `Wallet "${walletId}" not found for this account.`,
          'Use list-wallets to see available wallet IDs.',
        );
      }

      // Validate templates don't exceed max length at highest index
      const nameError = validateTemplate(nameTemplate, count, 32);
      if (nameError) {
        return agentError('INVALID_TEMPLATE', nameError, 'Shorten the nameTemplate or reduce count.');
      }
      const symbolError = validateTemplate(symbolTemplate, count, 10);
      if (symbolError) {
        return agentError('INVALID_TEMPLATE', symbolError, 'Shorten the symbolTemplate or reduce count.');
      }

      // Validate imageUrl before starting job (fail fast)
      if (imageUrl) {
        try {
          validateImageUrl(imageUrl);
        } catch (validationError) {
          return agentError(
            'INVALID_IMAGE_URL',
            validationError instanceof Error ? validationError.message : String(validationError),
            'Provide a publicly accessible https:// image URL that does not point to a private or internal address.',
          );
        }
      }

      // Create job and AbortController
      const job = createJob({ type: 'spam-launch', ttlMs: 2 * 60 * 60 * 1000 }); // 2hr TTL
      const jobId = job.id;
      const controller = new AbortController();
      abortControllers.set(jobId, controller);

      const api = createApiClient(userContext.apiKey, apiBaseUrl);

      // Fire-and-forget async IIFE -- runs the creation loop in background
      void (async () => {
        try {
          await runSpamLaunchLoop(
            api,
            {
              walletId,
              count,
              delayMs,
              nameTemplate,
              symbolTemplate,
              description,
              imageUrl,
              initialBuyAmountSol,
              failureMode,
              priorityLevel,
            },
            job,
            controller.signal,
          );
        } catch (error) {
          updateJob(jobId, {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          abortControllers.delete(jobId);
        }
      })();

      // Return immediately with jobId
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              jobId,
              message: 'Spam launch submitted. Use poll-job to track progress.',
              totalTokensRequested: count,
              estimatedDurationSeconds: Math.ceil((count * (delayMs + 3000)) / 1000),
              note: RICO_WARNING,
            }),
          },
        ],
      };
    },
  );

  // ── estimate-spam-cost ─────────────────────────────────────────────────────

  server.tool(
    'estimate-spam-cost',
    [
      'Estimate the total SOL and credits required for a spam-launch before executing.',
      'Run this before spam-launch to verify sufficient wallet balance.',
      'Returns a breakdown of network fees, token account rent, initial buy costs, and platform credits.',
      'Note: pump.fun creation fee is 0 SOL as of October 2025. Fees may change.',
      'Credit cost: 50,000 credits ($0.25) per token creation.',
      DISCLAIMER,
    ].join(' '),
    {
      count: z
        .number()
        .int()
        .min(1)
        .max(100)
        .describe('Number of tokens to create (1-100)'),
      initialBuyAmountSol: z
        .number()
        .min(0)
        .default(0)
        .describe('Optional SOL amount for dev initial buy per token (e.g. 0.01 = 0.01 SOL each)'),
      priorityLevel: z
        .enum(['economy', 'normal', 'fast', 'turbo'])
        .default('economy')
        .describe('Transaction priority tier (default: economy)'),
    },
    async ({ count, initialBuyAmountSol, priorityLevel }) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(computeSpamCostEstimate(count, initialBuyAmountSol, priorityLevel)),
          },
        ],
      };
    },
  );

  // ── cancel-spam-launch ─────────────────────────────────────────────────────

  server.tool(
    'cancel-spam-launch',
    [
      'Cancel a running spam-launch job.',
      'Tokens already created remain on-chain and are not affected.',
      'The job transitions to "cancelled" status.',
      'Remaining tokens in the queue are skipped.',
      'Use poll-job after cancelling to see the final outcome.',
    ].join(' '),
    {
      jobId: z
        .string()
        .describe('The jobId returned by spam-launch. Use poll-job to find active job IDs.'),
    },
    async ({ jobId }) => {
      const controller = abortControllers.get(jobId);
      if (!controller) {
        // Check if job exists but is already terminal
        const existingJob = getJob(jobId);
        if (!existingJob) {
          return agentError(
            'JOB_NOT_FOUND',
            `No spam-launch job found with ID "${jobId}".`,
            'Check the jobId or use poll-job to find active jobs.',
          );
        }
        return agentError(
          'JOB_ALREADY_TERMINAL',
          `Job "${jobId}" is already ${existingJob.status}.`,
          'Use poll-job to see the final results.',
        );
      }

      controller.abort();
      cancelJob(jobId);
      abortControllers.delete(jobId);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              jobId,
              status: 'cancelling',
              message:
                'Cancellation requested. The job will finish its current token creation and then stop. Use poll-job to see the final outcome.',
            }),
          },
        ],
      };
    },
  );
}
