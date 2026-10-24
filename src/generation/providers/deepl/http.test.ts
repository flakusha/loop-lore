// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for the DeepL HTTP layer: abort-signal combination, the auth-key
// guard, error mapping (401/403/456, 429 + retry-after, 5xx, other 4xx) and
// the shared retry policy in front of fetchRaw.
import { describe, expect, test, } from "bun:test";
import { ProviderError, } from "../types";
import { combineAbortSignals, fetchRaw, fetchWithRetry, handleErrorResponse, } from "./http";
import type { DeepLState, } from "./types";

const state: DeepLState = {
  baseUrl: "https://api-free.deepl.com",
  apiKey: "auth-key:fx",
  defaultModel: "en-us",
  timeout: 5000,
  retries: 1,
  headers: {},
};

type FetchHandler = (url: string, init: RequestInit,) => Response | Promise<Response>;

async function withMockFetch(handler: FetchHandler, fn: () => Promise<void>,): Promise<void> {
  const originalFetch = globalThis.fetch;

  (globalThis as Record<string, unknown>).fetch = handler;
  try {
    return await fn();
  } finally {
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  }
}

// ── combineAbortSignals ────────────────────────────────────

describe("combineAbortSignals", () => {
  test("returns undefined when no signal is defined", () => {
    expect(combineAbortSignals(undefined, undefined,),).toBeUndefined();
  });

  test("propagates an already-aborted signal immediately", () => {
    const aborted = AbortSignal.abort(new Error("gone",),);
    const combined = combineAbortSignals(aborted,);
    expect(combined?.aborted,).toBe(true,);
  });

  test("propagates a later abort from any of the signals", () => {
    const first = new AbortController();
    const second = new AbortController();
    const combined = combineAbortSignals(first.signal, second.signal,);
    expect(combined?.aborted,).toBe(false,);
    second.abort(new Error("cancelled",),);
    expect(combined?.aborted,).toBe(true,);
  });
});

// ── fetchRaw ───────────────────────────────────────────────

describe("fetchRaw", () => {
  test("throws a non-retryable 401 when no auth key is configured", async () => {
    await fetchRaw({ ...state, apiKey: "", }, "https://api-free.deepl.com/v2/translate", undefined,).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect(error,).toBeInstanceOf(ProviderError,);
        expect((error as ProviderError).statusCode,).toBe(401,);
        expect((error as ProviderError).retryable,).toBe(false,);
        expect((error as ProviderError).message,).toContain("requires an auth key",);
      },
    );
  });

  test("POSTs a JSON body with the DeepL-Auth-Key header", async () => {
    const captured: { url: string; init: RequestInit }[] = [];
    await withMockFetch(
      (url: string, init: RequestInit,) => {
        captured.push({ url, init, },);
        return Response.json({ translations: [], },);
      },
      async () => {
        await fetchRaw(state, "https://api-free.deepl.com/v2/translate", { text: ["hola",], },);
      },
    );

    const { url, init, } = captured[0]!;
    expect(url,).toBe("https://api-free.deepl.com/v2/translate",);
    expect(init.method,).toBe("POST",);
    const headers = new Headers(init.headers,);
    expect(headers.get("DeepL-Auth-Key",),).toBe("auth-key:fx",);
    expect(headers.get("Content-Type",),).toBe("application/json",);
    expect(JSON.parse(init.body as string,),).toEqual({ text: ["hola",], },);
  });

  test("GETs when no body is present and honours an auth key override", async () => {
    const captured: { url: string; init: RequestInit }[] = [];
    await withMockFetch(
      (url: string, init: RequestInit,) => {
        captured.push({ url, init, },);
        return Response.json({ languages: [], },);
      },
      async () => {
        await fetchRaw(state, "https://api-free.deepl.com/v2/languages", undefined, undefined, "override-key",);
      },
    );

    const { init, } = captured[0]!;
    expect(init.method,).toBe("GET",);
    expect(init.body,).toBeUndefined();
    expect(new Headers(init.headers,).get("DeepL-Auth-Key",),).toBe("override-key",);
  });
});

// ── handleErrorResponse ────────────────────────────────────

describe("handleErrorResponse", () => {
  test("prefers the provider's message over the status text", async () => {
    await handleErrorResponse(Response.json({ message: "Wrong key", }, { status: 403, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).message,).toBe("Wrong key",);
        expect((error as ProviderError).statusCode,).toBe(403,);
        expect((error as ProviderError).retryable,).toBe(false,);
      },
    );
  });

  test("falls back to the status text for a non-JSON body", async () => {
    await handleErrorResponse(new Response("gateway down", { status: 502, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).message,).toBe("DeepL request failed (502)",);
        expect((error as ProviderError).retryable,).toBe(true,);
      },
    );
  });

  test("marks 401, 403 and 456 as non-retryable", async () => {
    for (const status of [401, 403, 456,]) {
      await handleErrorResponse(Response.json({}, { status, },),).then(
        () => expect.unreachable(),
        (error: unknown,) => {
          expect((error as ProviderError).statusCode,).toBe(status,);
          expect((error as ProviderError).retryable,).toBe(false,);
        },
      );
    }
  });

  test("marks 429 as retryable and carries retry-after", async () => {
    await handleErrorResponse(Response.json({}, { status: 429, headers: { "retry-after": "12", }, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).retryable,).toBe(true,);
        expect((error as ProviderError).retryAfter,).toBe(12,);
      },
    );
  });

  test("leaves retryAfter unset when the header is missing", async () => {
    await handleErrorResponse(Response.json({}, { status: 429, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).retryAfter,).toBeUndefined();
      },
    );
  });

  test("marks other 4xx statuses as non-retryable", async () => {
    await handleErrorResponse(Response.json({}, { status: 400, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).statusCode,).toBe(400,);
        expect((error as ProviderError).retryable,).toBe(false,);
      },
    );
  });
});

// ── fetchWithRetry ─────────────────────────────────────────

describe("fetchWithRetry", () => {
  test("returns parsed JSON on the first successful attempt", async () => {
    let calls = 0;
    await withMockFetch(
      () => {
        calls++;
        return Response.json({ translations: [{ text: "hello", },], },);
      },
      async () => {
        const data = await fetchWithRetry(state, "https://api-free.deepl.com/v2/translate", { text: ["hola",], },);
        expect(data,).toEqual({ translations: [{ text: "hello", },], },);
      },
    );

    expect(calls,).toBe(1,);
  });

  test("retries a 500 and succeeds on the next attempt", async () => {
    let calls = 0;
    await withMockFetch(
      () => {
        calls++;
        return calls === 1 ? new Response("{}", { status: 500, },) : Response.json({ translations: [], },);
      },
      async () => {
        const data = await fetchWithRetry(state, "https://api-free.deepl.com/v2/translate", { text: ["hola",], },);
        expect(data,).toEqual({ translations: [], },);
      },
    );

    expect(calls,).toBe(2,);
  }, 15_000,);

  test("does not retry a non-retryable 403", async () => {
    let calls = 0;
    await withMockFetch(
      () => {
        calls++;
        return new Response("{}", { status: 403, },);
      },
      async () => {
        await fetchWithRetry(state, "https://api-free.deepl.com/v2/translate", { text: ["hola",], },).then(
          () => expect.unreachable(),
          (error: unknown,) => {
            expect((error as ProviderError).statusCode,).toBe(403,);
          },
        );
      },
    );

    expect(calls,).toBe(1,);
  });
});
