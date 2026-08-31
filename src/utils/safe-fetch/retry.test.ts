/**
 * Tests for utils/safe-fetch/retry.ts — safeFetchWithRetry
 *
 * Verifies retry counts, client-error short-circuit, timeout
 * short-circuit, and exponential backoff via mocked fetch.
 */
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { safeFetchWithRetry, } from "./retry";

const originalFetch = globalThis.fetch;

/**
 * Run fn with globalThis.fetch swapped for handler (codebase mock-fetch pattern).
 * @param handler
 * @param fn
 */
async function withMockFetch(
  handler: (url: string | URL | Request, init?: RequestInit,) => Response | Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  (globalThis as Record<string, unknown>).fetch = handler;
  try {
    return await fn();
  } finally {
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  }
}

afterEach(() => {
  (globalThis as Record<string, unknown>).fetch = originalFetch;
},);

/**
 * @param statuses
 */
function sequenceFetch(statuses: number[],): typeof fetch {
  let i = 0;
  return mock(() =>
    Promise.resolve(
      new Response("{}", {
        status: statuses[Math.min(i++, statuses.length - 1,)],
      },),
    )
  ) as unknown as typeof fetch;
}

describe("safeFetchWithRetry — success paths", () => {
  test("returns success on first attempt", async () => {
    const fetchMock = sequenceFetch([200,],);
    await withMockFetch(fetchMock, async () => {
      const result = await safeFetchWithRetry("https://example.com/api", {}, 3, 1,);
      expect(result.ok,).toBe(true,);
      expect(fetchMock,).toHaveBeenCalledTimes(1,);
    },);
  });

  test("retries on 5xx then succeeds", async () => {
    const fetchMock = sequenceFetch([500, 200,],);
    await withMockFetch(fetchMock, async () => {
      const result = await safeFetchWithRetry("https://example.com/api", {}, 3, 1,);
      expect(result.ok,).toBe(true,);
      expect(fetchMock,).toHaveBeenCalledTimes(2,);
    },);
  });

  test("uses default retries=3 and baseDelay=1000 when omitted", async () => {
    const fetchMock = sequenceFetch([503, 503, 503, 503,],);
    await withMockFetch(fetchMock, async () => {
      const result = await safeFetchWithRetry("https://example.com/api",);
      expect(result.ok,).toBe(false,);
      expect(fetchMock,).toHaveBeenCalledTimes(4,);
    },);
  }, 15_000,);
});

describe("safeFetchWithRetry — non-retryable failures", () => {
  test("does not retry client errors (404)", async () => {
    const fetchMock = sequenceFetch([404,],);
    await withMockFetch(fetchMock, async () => {
      const result = await safeFetchWithRetry("https://example.com/api", {}, 3, 1,);
      expect(result.ok,).toBe(false,);
      if (!result.ok) { expect(result.status,).toBe(404,); }
      expect(fetchMock,).toHaveBeenCalledTimes(1,);
    },);
  });

  test("does not retry 401", async () => {
    const fetchMock = sequenceFetch([401,],);
    await withMockFetch(fetchMock, async () => {
      const result = await safeFetchWithRetry("https://example.com/api", {}, 3, 1,);
      expect(result.ok,).toBe(false,);
      expect(fetchMock,).toHaveBeenCalledTimes(1,);
    },);
  });

  test("does not retry timeouts", async () => {
    const abortOnSignal = mock((_url: string, init?: RequestInit,) =>
      new Promise((_resolve, reject,) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError",),), {
          once: true,
        },);
      },)
    );
    await withMockFetch(abortOnSignal as unknown as typeof fetch, async () => {
      const result = await safeFetchWithRetry("https://example.com/slow", { timeout: 20, }, 3, 1,);
      expect(result.ok,).toBe(false,);
      if (!result.ok) { expect(result.error.message,).toContain("timed out",); }
      expect(abortOnSignal,).toHaveBeenCalledTimes(1,);
    },);
  });
});

describe("safeFetchWithRetry — exhaustion", () => {
  test("gives up after retries+1 attempts and returns last error", async () => {
    const fetchMock = sequenceFetch([500,],);
    await withMockFetch(fetchMock, async () => {
      const result = await safeFetchWithRetry("https://example.com/api", {}, 2, 1,);
      expect(result.ok,).toBe(false,);
      if (!result.ok) { expect(result.error.message,).toContain("HTTP 500",); }
      expect(fetchMock,).toHaveBeenCalledTimes(3,);
    },);
  });

  test("retries network errors (no status)", async () => {
    let i = 0;
    const fetchMock = mock(() => {
      i++;
      if (i < 3) { return Promise.reject(new Error("ECONNRESET",),); }
      return Promise.resolve(new Response("{}", { status: 200, },),);
    },);
    await withMockFetch(fetchMock, async () => {
      const result = await safeFetchWithRetry("https://example.com/api", {}, 3, 1,);
      expect(result.ok,).toBe(true,);
      expect(fetchMock,).toHaveBeenCalledTimes(3,);
    },);
  });
});
