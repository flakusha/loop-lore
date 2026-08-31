/**
 * Tests for utils/safe-fetch/fetch.ts — safeFetch wrapper
 *
 * Uses a mocked global fetch to exercise timeout, size limits, JSON
 * handling, auth header injection, and 401 behavior without network.
 */
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { DEFAULT_MAX_SIZE, DEFAULT_TIMEOUT, } from "./constants";
import { safeFetch, } from "./fetch";

const originalFetch = globalThis.fetch;

type FetchUrl = string | URL | Request;

/**
 * Run fn with globalThis.fetch swapped for handler (codebase mock-fetch pattern).
 * @param handler
 * @param fn
 */
async function withMockFetch(
  handler: (url: FetchUrl, init?: RequestInit,) => Response | Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  (globalThis as Record<string, unknown>).fetch = handler;
  try {
    return await fn();
  } finally {
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  }
}

/** */
function abortError(): Error {
  return new DOMException("Aborted", "AbortError",);
}

/** fetch stub that rejects with AbortError when the request signal aborts. */
function neverResolvingFetch(): typeof fetch {
  return mock((_url: FetchUrl, init?: RequestInit,) =>
    new Promise((_resolve, reject,) => {
      init?.signal?.addEventListener("abort", () => reject(abortError(),), { once: true, },);
    },)
  ) as unknown as typeof fetch;
}

/**
 * @param payload
 * @param status
 * @param headers
 */
function jsonFetch(payload: unknown, status = 200, headers?: Record<string, string>,): typeof fetch {
  return mock(() => Response.json(payload, { status, headers, },)) as unknown as typeof fetch;
}

afterEach(() => {
  (globalThis as Record<string, unknown>).fetch = originalFetch;
},);

describe("safeFetch — success paths", () => {
  test("parses JSON body by default", async () => {
    await withMockFetch(jsonFetch({ hello: "world", },), async () => {
      const result = await safeFetch<{ hello: string }>("https://example.com/api",);
      expect(result.ok,).toBe(true,);
      if (result.ok) {
        expect(result.data,).toEqual({ hello: "world", },);
        expect(result.status,).toBe(200,);
      }
    },);
  });

  test("returns raw text when parseJson is false", async () => {
    await withMockFetch(mock(() => new Response("plain text", { status: 200, },)), async () => {
      const result = await safeFetch<string>("https://example.com/raw", { parseJson: false, },);
      expect(result.ok,).toBe(true,);
      if (result.ok) { expect(result.data,).toBe("plain text",); }
    },);
  });

  test("returns HTTP error result for non-2xx", async () => {
    await withMockFetch(jsonFetch({ error: "boom", }, 500,), async () => {
      const result = await safeFetch("https://example.com/api",);
      expect(result.ok,).toBe(false,);
      if (!result.ok) {
        expect(result.status,).toBe(500,);
        expect(result.error.message,).toContain("HTTP 500",);
      }
    },);
  });
});

describe("safeFetch — 401 handling", () => {
  test("calls onAuthError and returns Unauthorized by default", async () => {
    const onAuthError = mock(() => {},);
    await withMockFetch(jsonFetch({}, 401,), async () => {
      const result = await safeFetch("https://example.com/api", { onAuthError, },);
      expect(onAuthError,).toHaveBeenCalledTimes(1,);
      expect(result.ok,).toBe(false,);
      if (!result.ok) {
        expect(result.status,).toBe(401,);
        expect(result.error.message,).toBe("Unauthorized",);
      }
    },);
  });

  test("does not call onAuthError when handle401 is false", async () => {
    const onAuthError = mock(() => {},);
    await withMockFetch(jsonFetch({}, 401,), async () => {
      const result = await safeFetch("https://example.com/api", { handle401: false, onAuthError, },);
      expect(onAuthError,).not.toHaveBeenCalled();
      expect(result.ok,).toBe(false,);
      if (!result.ok) { expect(result.error.message,).toContain("HTTP 401",); }
    },);
  });
});

describe("safeFetch — size limits", () => {
  test("rejects response when content-length exceeds maxSize", async () => {
    await withMockFetch(jsonFetch({ big: "x", }, 200, { "content-length": "99999999", },), async () => {
      const result = await safeFetch("https://example.com/api", { maxSize: 100, },);
      expect(result.ok,).toBe(false,);
      if (!result.ok) {
        expect(result.error.message,).toContain("Response too large",);
        expect(result.error.message,).toContain("99999999",);
        expect(result.status,).toBe(200,);
      }
    },);
  });

  test("rejects response when body text exceeds maxSize without content-length", async () => {
    await withMockFetch(mock(() => new Response("x".repeat(500,), { status: 200, },)), async () => {
      const result = await safeFetch("https://example.com/api", { maxSize: 100, },);
      expect(result.ok,).toBe(false,);
      if (!result.ok) { expect(result.error.message,).toContain("Response body too large",); }
    },);
  });

  test("accepts response within maxSize", async () => {
    await withMockFetch(mock(() => new Response("x".repeat(50,), { status: 200, },)), async () => {
      const result = await safeFetch("https://example.com/api", { maxSize: 100, parseJson: false, },);
      expect(result.ok,).toBe(true,);
    },);
  });
});

describe("safeFetch — timeout and abort", () => {
  test("times out and reports timeout error", async () => {
    await withMockFetch(neverResolvingFetch(), async () => {
      const result = await safeFetch("https://example.com/slow", { timeout: 20, },);
      expect(result.ok,).toBe(false,);
      if (!result.ok) { expect(result.error.message,).toBe("Request timed out after 20ms",); }
    },);
  });

  test("external abort surfaces as timeout error (current behavior)", async () => {
    const controller = new AbortController();
    const promise = withMockFetch(neverResolvingFetch(), async () => {
      const result = await safeFetch("https://example.com/slow", {
        timeout: 5000,
        signal: controller.signal,
      },);
      expect(result.ok,).toBe(false,);
      if (!result.ok) { expect(result.error.message,).toBe("Request timed out after 5000ms",); }
    },);
    setTimeout(() => controller.abort(), 10,);
    await promise;
  });

  test("propagates network errors", async () => {
    await withMockFetch(mock(() => Promise.reject(new Error("socket hang up",),)), async () => {
      const result = await safeFetch("https://example.com/api",);
      expect(result.ok,).toBe(false,);
      if (!result.ok) { expect(result.error.message,).toBe("socket hang up",); }
    },);
  });
});

describe("safeFetch — request body serialization", () => {
  test("passes string bodies through without double serialization", async () => {
    let captured: RequestInit | undefined;
    await withMockFetch(
      mock((_url: FetchUrl, init?: RequestInit,) => {
        captured = init;
        return Promise.resolve(Response.json({},),);
      },),
      async () => {
        await safeFetch("https://example.com/api", { body: "raw-string", },);
        expect(captured?.body,).toBe("raw-string",);
      },
    );
  });

  test("JSON-stringifies object bodies and sets Content-Type", async () => {
    let captured: RequestInit | undefined;
    await withMockFetch(
      mock((_url: FetchUrl, init?: RequestInit,) => {
        captured = init;
        return Promise.resolve(Response.json({},),);
      },),
      async () => {
        await safeFetch("https://example.com/api", { body: { a: 1, }, },);
        expect(captured?.body,).toBe('{"a":1}',);
        expect(new Headers(captured?.headers,).get("Content-Type",),).toBe("application/json",);
      },
    );
  });

  test("preserves caller Content-Type over auto-set", async () => {
    let captured: RequestInit | undefined;
    await withMockFetch(
      mock((_url: FetchUrl, init?: RequestInit,) => {
        captured = init;
        return Promise.resolve(Response.json({},),);
      },),
      async () => {
        await safeFetch("https://example.com/api", {
          body: { a: 1, },
          headers: { "Content-Type": "application/x-ndjson", },
        },);
        expect(new Headers(captured?.headers,).get("Content-Type",),).toBe("application/x-ndjson",);
      },
    );
  });

  test("sets Content-Type for string bodies too (any serialized body)", async () => {
    let captured: RequestInit | undefined;
    await withMockFetch(
      mock((_url: FetchUrl, init?: RequestInit,) => {
        captured = init;
        return Promise.resolve(Response.json({},),);
      },),
      async () => {
        await safeFetch("https://example.com/api", { body: "raw-string", },);
        expect(new Headers(captured?.headers,).get("Content-Type",),).toBe("application/json",);
      },
    );
  });

  test("does not set Content-Type when there is no body", async () => {
    let captured: RequestInit | undefined;
    await withMockFetch(
      mock((_url: FetchUrl, init?: RequestInit,) => {
        captured = init;
        return Promise.resolve(Response.json({},),);
      },),
      async () => {
        await safeFetch("https://example.com/api",);
        expect(new Headers(captured?.headers,).get("Content-Type",),).toBeNull();
      },
    );
  });

  test("returns serialization failure for circular bodies", async () => {
    await withMockFetch(jsonFetch({},), async () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const result = await safeFetch("https://example.com/api", { body: circular, },);
      expect(result.ok,).toBe(false,);
      if (!result.ok) { expect(result.error.message,).toBe("body serialization failed",); }
    },);
  });
});

describe("safeFetch — auth header injection", () => {
  test("injects CSRF and session token headers", async () => {
    let captured: RequestInit | undefined;
    await withMockFetch(
      mock((_url: FetchUrl, init?: RequestInit,) => {
        captured = init;
        return Promise.resolve(Response.json({},),);
      },),
      async () => {
        await safeFetch("https://example.com/api", {
          auth: { csrfToken: "csrf-123", sessionToken: "sess-456", },
        },);
        const headers = new Headers(captured?.headers,);
        expect(headers.get("X-CSRF-Token",),).toBe("csrf-123",);
        expect(headers.get("Authorization",),).toBe("Bearer sess-456",);
      },
    );
  });

  test("authorization takes precedence over sessionToken", async () => {
    let captured: RequestInit | undefined;
    await withMockFetch(
      mock((_url: FetchUrl, init?: RequestInit,) => {
        captured = init;
        return Promise.resolve(Response.json({},),);
      },),
      async () => {
        await safeFetch("https://example.com/api", {
          auth: { sessionToken: "sess-456", authorization: "Bearer custom", },
        },);
        expect(new Headers(captured?.headers,).get("Authorization",),).toBe("Bearer custom",);
      },
    );
  });

  test("merges custom headers with auth headers", async () => {
    let captured: RequestInit | undefined;
    await withMockFetch(
      mock((_url: FetchUrl, init?: RequestInit,) => {
        captured = init;
        return Promise.resolve(Response.json({},),);
      },),
      async () => {
        await safeFetch("https://example.com/api", {
          auth: { csrfToken: "csrf-123", extraHeaders: { "X-Custom": "yes", }, },
          headers: { "X-Other": "no", },
        },);
        const headers = new Headers(captured?.headers,);
        expect(headers.get("X-CSRF-Token",),).toBe("csrf-123",);
        expect(headers.get("X-Custom",),).toBe("yes",);
        expect(headers.get("X-Other",),).toBe("no",);
      },
    );
  });
});

describe("safeFetch — defaults", () => {
  test("uses default timeout and maxSize constants", () => {
    expect(DEFAULT_TIMEOUT,).toBe(30_000,);
    expect(DEFAULT_MAX_SIZE,).toBe(10_485_760,);
  });
});
