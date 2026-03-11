import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenPump } from '../src/index.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as Response;
}

describe('Jobs', () => {
  let op: OpenPump;

  beforeEach(() => {
    op = new OpenPump({ apiKey: 'op_sk_test_123', baseUrl: 'http://localhost:3001' });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('get() returns job status', async () => {
    const jobStatus = { jobId: 'j1', status: 'active', progress: 50 };
    mockFetch.mockResolvedValueOnce(mockResponse({ data: jobStatus }));

    const result = await op.jobs.get('j1');
    expect(result).toEqual(jobStatus);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/jobs/j1',
      expect.anything(),
    );
  });

  it('poll() resolves immediately when job is already completed', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        data: { jobId: 'j1', status: 'completed', progress: 100, result: { bundleStatuses: [] } },
      }),
    );

    const result = await op.jobs.poll('j1');
    expect(result.status).toBe('completed');
  });

  it('poll() resolves after multiple polls when job completes', async () => {
    vi.useFakeTimers();

    mockFetch
      .mockResolvedValueOnce(
        mockResponse({ data: { jobId: 'j1', status: 'active', progress: 50 } }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          data: {
            jobId: 'j1',
            status: 'completed',
            progress: 100,
            result: { bundleStatuses: [] },
          },
        }),
      );

    const pollPromise = op.jobs.poll('j1', { intervalMs: 100, timeoutMs: 5000 });

    // Advance timers to trigger the interval wait
    await vi.advanceTimersByTimeAsync(100);

    const result = await pollPromise;
    expect(result.status).toBe('completed');

    vi.useRealTimers();
  });

  it('poll() rejects when job fails', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        data: { jobId: 'j1', status: 'failed', progress: 0, error: 'Bundle submission failed' },
      }),
    );

    await expect(
      op.jobs.poll('j1', { intervalMs: 100, timeoutMs: 5000 }),
    ).rejects.toThrow('Bundle submission failed');
  });

  it('poll() rejects with default message when failed job has no error', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        data: { jobId: 'j1', status: 'failed', progress: 0 },
      }),
    );

    await expect(
      op.jobs.poll('j1', { intervalMs: 100, timeoutMs: 5000 }),
    ).rejects.toThrow('Job j1 failed');
  });

  it('poll() rejects on timeout', async () => {
    vi.useFakeTimers();

    // Always return active
    mockFetch.mockResolvedValue(
      mockResponse({ data: { jobId: 'j1', status: 'active', progress: 10 } }),
    );

    const pollPromise = op.jobs.poll('j1', { intervalMs: 50, timeoutMs: 200 });

    // Capture rejection immediately to prevent unhandled rejection
    // during timer advancement (the promise may reject between loop iterations)
    let rejectionError: unknown;
    pollPromise.catch((e: unknown) => {
      rejectionError = e;
    });

    // Advance timers past timeout in small increments to allow the poll loop to execute
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(50);
    }

    expect(rejectionError).toBeDefined();
    expect((rejectionError as Error).message).toMatch(/timed out/);

    vi.useRealTimers();
  });

  it('poll() respects AbortSignal', async () => {
    // Return active first, then the abort should prevent further polls
    mockFetch.mockResolvedValueOnce(
      mockResponse({ data: { jobId: 'j1', status: 'active', progress: 10 } }),
    );

    const controller = new AbortController();

    // Abort before starting the poll
    controller.abort();

    await expect(
      op.jobs.poll('j1', {
        intervalMs: 100,
        timeoutMs: 5000,
        signal: controller.signal,
      }),
    ).rejects.toThrow(/aborted/);
  });

  it('poll() calls onProgress callback', async () => {
    vi.useFakeTimers();

    const onProgress = vi.fn();
    mockFetch
      .mockResolvedValueOnce(
        mockResponse({ data: { jobId: 'j1', status: 'active', progress: 50 } }),
      )
      .mockResolvedValueOnce(
        mockResponse({ data: { jobId: 'j1', status: 'completed', progress: 100 } }),
      );

    const pollPromise = op.jobs.poll('j1', {
      intervalMs: 100,
      timeoutMs: 5000,
      onProgress,
    });
    await vi.advanceTimersByTimeAsync(100);
    await pollPromise;

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));

    vi.useRealTimers();
  });
});
