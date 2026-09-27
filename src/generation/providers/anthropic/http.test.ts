// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for the Anthropic HTTP layer: abort-signal combination, the API-key
// guard, error mapping, stop-reason mapping, and the shared retry policy in
// front of fetchRaw.
import { describe, expect, test, } from "bun:test";
import { ProviderError, } from "../types";
import { combineAbortSignals, fetchRaw, fetchWithRetry, handleErrorResponse, mapFinishReason, } from "./http";
import type { AnthropicState, } from "./types";

const state: AnthropicState = {
  baseUrl: "https://api.anthropic.test",
  apiKey: "sk-ant-test",
  defaultModel: "claude-test",
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

  test("propagates a later abort from the first signal", () => {
    const first = new AbortController();
    const second = new AbortController();
    const combined = combineAbortSignals(first.signal, second.signal,);
    expect(combined?.aborted,).toBe(false,);
    first.abort(new Error("cancelled",),);
    expect(combined?.aborted,).toBe(true,);
  });
});

// ── fetchRaw ───────────────────────────────────────────────

describe("fetchRaw", () => {
  test("throws a non-retryable 401 when no API key is configured", async () => {
    await fetchRaw({ ...state, apiKey: "", }, "https://api.anthropic.test/v1/messages", undefined,).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect(error,).toBeInstanceOf(ProviderError,);
        expect((error as ProviderError).statusCode,).toBe(401,);
        expect((error as ProviderError).retryable,).toBe(false,);
      },
    );
  });

  test("adds the tools beta header only for tool-calling requests", async () => {
    const captured: Headers[] = [];
    await withMockFetch(
      (url: string, init: RequestInit,) => {
        expect(url,).toBe("https://api.anthropic.test/v1/messages",);
        captured.push(new Headers(init.headers,),);
        return Response.json({ ok: true, },);
      },
      async () => {
        const url = "https://api.anthropic.test/v1/messages";
        await fetchRaw(state, url, { a: 1, }, undefined, undefined, true,);
        await fetchRaw(state, url, { a: 1, },);
      },
    );
    expect(captured.length,).toBe(2,);
    for (const headers of captured) {
      expect(headers.get("x-api-key",),).toBe("sk-ant-test",);
      expect(headers.get("anthropic-version",),).not.toBeNull();
    }
    expect(captured[0]?.get("anthropic-beta",),).toContain("tools-",);
    expect(captured[1]?.get("anthropic-beta",),).toBeNull();
  });
});

// ── handleErrorResponse ────────────────────────────────────

describe("handleErrorResponse", () => {
  test("prefers the provider's error message over the status text", async () => {
    await handleErrorResponse(Response.json({ error: { message: "overloaded", }, }, { status: 529, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).message,).toBe("overloaded",);
        expect((error as ProviderError).retryable,).toBe(true,);
      },
    );
  });

  test("falls back to the status text for a non-JSON body", async () => {
    await handleErrorResponse(new Response("gateway down", { status: 502, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).message,).toBe("Anthropic request failed (502)",);
        expect((error as ProviderError).retryable,).toBe(true,);
      },
    );
  });

  test("marks 401 and 403 as non-retryable", async () => {
    for (const status of [401, 403,]) {
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

  test("leaves retryAfter unset when the header is missing or unparsable", async () => {
    await handleErrorResponse(Response.json({}, { status: 429, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).retryAfter,).toBeUndefined();
      },
    );
  });

  test("marks 4xx other than 401/403/429 as non-retryable", async () => {
    await handleErrorResponse(Response.json({}, { status: 400, },),).then(
      () => expect.unreachable(),
      (error: unknown,) => {
        expect((error as ProviderError).statusCode,).toBe(400,);
        expect((error as ProviderError).retryable,).toBe(false,);
      },
    );
  });
});

// ── mapFinishReason ────────────────────────────────────────

describe("mapFinishReason", () => {
  test("maps end_turn, stop_sequence, tool_use and pause_turn to stop", () => {
    for (const reason of ["end_turn", "stop_sequence", "tool_use", "pause_turn",]) {
      expect(mapFinishReason(reason,),).toBe("stop",);
    }
  });

  test("maps max_tokens to length", () => {
    expect(mapFinishReason("max_tokens",),).toBe("length",);
  });

  test("maps refusal, null, undefined and unknown reasons to stop", () => {
    for (const reason of ["refusal", null, undefined, "something_new",] as const) {
      expect(mapFinishReason(reason,),).toBe("stop",);
    }
  });
});

// ── fetchWithRetry ─────────────────────────────────────────

describe("fetchWithRetry", () => {
  test("returns parsed JSON on the first successful attempt", async () => {
    let calls = 0;
    await withMockFetch(
      () => {
        calls++;
        return Response.json({ content: "hi", },);
      },
      async () => {
        const data = await fetchWithRetry(state, "https://api.anthropic.test/v1/messages", { a: 1, },);
        expect(data,).toEqual({ content: "hi", },);
      },
    );
    expect(calls,).toBe(1,);
  });

  test("retries a 500 and succeeds on the next attempt", async () => {
    let calls = 0;
    await withMockFetch(
      () => {
        calls++;
        return calls === 1 ? new Response("{}", { status: 500, },) : Response.json({ content: "recovered", },);
      },
      async () => {
        const data = await fetchWithRetry(state, "https://api.anthropic.test/v1/messages", { a: 1, },);
        expect(data,).toEqual({ content: "recovered", },);
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
        await fetchWithRetry(state, "https://api.anthropic.test/v1/messages", { a: 1, },).then(
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
