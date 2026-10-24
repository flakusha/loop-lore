// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for the LibreTranslate HTTP layer: abort-signal combination, request
// shaping (the optional `api_key` body field), error mapping (401/403, 429 +
// retry-after, 5xx, other 4xx) and the shared retry policy in front of fetchRaw.
//
// The API key is OPTIONAL for LibreTranslate (many instances run without one),
// so there is no key guard to cover here.
import { describe, expect, test, } from "bun:test";
import { ProviderError, } from "../types";
import { combineAbortSignals, fetchRaw, fetchWithRetry, handleErrorResponse, } from "./http";
import type { LibreTranslateState, } from "./types";

const state: LibreTranslateState = {
  baseUrl: "http://localhost:5000",
  apiKey: undefined,
  defaultModel: "en",
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
    expect(combineAbortSignals(aborted,)?.aborted,).toBe(true,);
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
  test("POSTs a JSON body without api_key when no key is configured", async () => {
    const captured: { url: string; init: RequestInit }[] = [];
    await withMockFetch(
      (url: string, init: RequestInit,) => {
        captured.push({ url, init, },);
        return Response.json({ translatedText: "hello", },);
      },
      async () => {
        await fetchRaw(state, "http://localhost:5000/translate", { q: "hola", },);
      },
    );

    const { url, init, } = captured[0]!;
    expect(url,).toBe("http://localhost:5000/translate",);
    expect(init.method,).toBe("POST",);
    expect(new Headers(init.headers,).get("Content-Type",),).toBe("application/json",);
    expect(JSON.parse(init.body as string,),).toEqual({ q: "hola", },);
  });

  test("adds api_key to the body when the instance has a key", async () => {
    const captured: { init: RequestInit }[] = [];
    await withMockFetch(
      (_url: string, init: RequestInit,) => {
        captured.push({ init, },);
        return Response.json({ translatedText: "hello", },);
      },
      async () => {
        await fetchRaw({ ...state, apiKey: "instance-key", }, "http://localhost:5000/translate", { q: "hola", },);
      },
    );

    expect(JSON.parse(captured[0]!.init.body as string,),).toEqual({ q: "hola", api_key: "instance-key", },);
  });

  test("a per-request key overrides the configured one", async () => {
    const captured: { init: RequestInit }[] = [];
    await withMockFetch(
      (_url: string, init: RequestInit,) => {
        captured.push({ init, },);
        return Response.json({ translatedText: "hello", },);
      },
      async () => {
        await fetchRaw(
          { ...state, apiKey: "instance-key", },
          "http://localhost:5000/translate",
          { q: "hola", },
          undefined,
          "byo-key",
        );
      },
    );

    expect(JSON.parse(captured[0]!.init.body as string,).api_key,).toBe("byo-key",);
  });

  test("GETs when no body is present and forwards the caller's abort signal", async () => {
    const captured: { init: RequestInit }[] = [];
    const controller = new AbortController();
    await withMockFetch(
      (_url: string, init: RequestInit,) => {
        captured.push({ init, },);
        return Response.json([{ code: "en", name: "English", },],);
      },
      async () => {
        await fetchRaw(state, "http://localhost:5000/languages", undefined, controller.signal,);
      },
    );

    const { init, } = captured[0]!;
    expect(init.method,).toBe("GET",);
    expect(init.body,).toBeUndefined();
    expect(init.signal,).toBeDefined();
  });
});

// ── handleErrorResponse ────────────────────────────────────

describe("handleErrorResponse", () => {
  test("prefers the provider's error string over the status text", async () => {
    await handleErrorResponse(Response.json({ error: "Invalid API key", }, { status: 403, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect(error,).toBeInstanceOf(ProviderError,);
        expect((error as ProviderError).statusCode,).toBe(403,);
        expect((error as ProviderError).retryable,).toBe(false,);
        expect((error as ProviderError).message,).toBe("Invalid API key",);
      },
    );
  });

  test("falls back to the status message when the error body is not JSON", async () => {
    await handleErrorResponse(new Response("not json", { status: 400, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).statusCode,).toBe(400,);
        expect((error as ProviderError).retryable,).toBe(false,);
        expect((error as ProviderError).message,).toContain("LibreTranslate request failed (400)",);
      },
    );
  });

  test("marks 401 as non-retryable", async () => {
    await handleErrorResponse(Response.json({ error: "Unauthorized", }, { status: 401, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).statusCode,).toBe(401,);
        expect((error as ProviderError).retryable,).toBe(false,);
      },
    );
  });

  test("maps a 429 to a retryable error carrying the retry-after delay", async () => {
    const response = new Response(JSON.stringify({ error: "Slow down", },), {
      status: 429,
      headers: { "retry-after": "3", },
    },);

    await handleErrorResponse(response,).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).statusCode,).toBe(429,);
        expect((error as ProviderError).retryable,).toBe(true,);
        expect((error as ProviderError).retryAfter,).toBe(3,);
      },
    );
  });

  test("leaves retryAfter unset when the header is missing", async () => {
    await handleErrorResponse(Response.json({ error: "Slow down", }, { status: 429, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).retryAfter,).toBeUndefined();
      },
    );
  });

  test("maps a 5xx to a retryable error", async () => {
    await handleErrorResponse(Response.json({ error: "Server error", }, { status: 502, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).statusCode,).toBe(502,);
        expect((error as ProviderError).retryable,).toBe(true,);
        expect((error as ProviderError).message,).toBe("Server error",);
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
        return Response.json({ translatedText: "hello", },);
      },
      async () => {
        const data = await fetchWithRetry(state, "http://localhost:5000/translate", { q: "hola", },);
        expect(data,).toEqual({ translatedText: "hello", },);
      },
    );

    expect(calls,).toBe(1,);
  });

  test("retries a 500 and succeeds on the next attempt", async () => {
    let calls = 0;
    await withMockFetch(
      () => {
        calls++;
        return calls === 1 ? new Response("{}", { status: 500, },) : Response.json({ translatedText: "hello", },);
      },
      async () => {
        const data = await fetchWithRetry(state, "http://localhost:5000/translate", { q: "hola", },);
        expect(data,).toEqual({ translatedText: "hello", },);
      },
    );

    expect(calls,).toBe(2,);
  }, 15_000,);

  test("does not retry a non-retryable 401", async () => {
    let calls = 0;
    await withMockFetch(
      () => {
        calls++;
        return new Response("{}", { status: 401, },);
      },
      async () => {
        await fetchWithRetry(state, "http://localhost:5000/translate", { q: "hola", },).then(
          () => expect.unreachable(),
          (error: unknown,) => {
            expect((error as ProviderError).statusCode,).toBe(401,);
          },
        );
      },
    );

    expect(calls,).toBe(1,);
  });
});
