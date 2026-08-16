/**
 * Tests for the OpenAI-compatible HTTP layer: body building, error mapping,
 * abort-signal combination, and retry behavior.
 */
import { describe, expect, test, } from "bun:test";
import type { GenerateRequest, ToolDef, } from "../types";
import {
  ProviderAuthError,
  ProviderError,
  ProviderRateLimitError,
} from "../types";
import {
  buildBody,
  combineAbortSignals,
  fetchRaw,
  fetchWithRetry,
  handleErrorResponse,
  mapFinishReason,
} from "./http";
import type { OpenAiCompatibleState, } from "./types";

type FetchHandler = (url: string, init: RequestInit,) => Response | Promise<Response>;

const state: OpenAiCompatibleState = {
  baseUrl: "https://provider.example",
  apiKey: "sk-test",
  defaultModel: "default-model",
  timeout: 5000,
  retries: 1,
  headers: { "X-Custom": "yes", },
};

function baseReq(overrides: Partial<GenerateRequest> = {},): GenerateRequest {
  return {
    model: "m1",
    messages: [{ role: "user", content: "hi", },],
    params: {},
    ...overrides,
  };
}

// ── buildBody ─────────────────────────────────────────────

describe("buildBody", () => {
  test("uses the request model and stream flag", () => {
    const body = buildBody(state, baseReq({ model: "m2", },), true,);
    expect(body.model,).toBe("m2",);
    expect(body.stream,).toBe(true,);
    expect(body.messages,).toHaveLength(1,);
  });

  test("falls back to the default model when the request omits it", () => {
    const body = buildBody(state, baseReq({ model: "", },), false,);
    expect(body.model,).toBe("default-model",);
  });

  test("maps common OpenAI sampling params", () => {
    const body = buildBody(
      state,
      baseReq({
        params: {
          temperature: 0.7,
          maxTokens: 100,
          topP: 0.9,
          stop: ["END",],
          presencePenalty: 0.2,
          frequencyPenalty: 0.3,
        },
      },),
      false,
    );
    expect(body.temperature,).toBeCloseTo(0.7, 5,);
    expect(body.max_tokens,).toBe(100,);
    expect(body.top_p,).toBeCloseTo(0.9, 5,);
    expect(body.stop,).toEqual(["END",],);
    expect(body.presence_penalty,).toBeCloseTo(0.2, 5,);
    expect(body.frequency_penalty,).toBeCloseTo(0.3, 5,);
  });

  test("maps llama.cpp extended sampling params", () => {
    const body = buildBody(
      state,
      baseReq({
        params: {
          minP: 0.05,
          topK: 40,
          typicalP: 0.9,
          repeatPenalty: 1.1,
          dryMultiplier: 0.8,
          dryBase: 1.75,
          dryAllowedLength: 2,
          xtcProbability: 0.5,
          dynatempRange: 1.5,
          dynatempExponent: 1,
          reasoningBudget: 2048,
        },
      },),
      false,
    );
    expect(body.min_p,).toBeCloseTo(0.05, 5,);
    expect(body.top_k,).toBe(40,);
    expect(body.typical_p,).toBeCloseTo(0.9, 5,);
    expect(body.repeat_penalty,).toBeCloseTo(1.1, 5,);
    expect(body.dry_multiplier,).toBeCloseTo(0.8, 5,);
    expect(body.dry_base,).toBeCloseTo(1.75, 5,);
    expect(body.dry_allowed_length,).toBe(2,);
    expect(body.xtc_probability,).toBeCloseTo(0.5, 5,);
    expect(body.dynatemp_range,).toBeCloseTo(1.5, 5,);
    expect(body.dynatemp_exponent,).toBe(1,);
    expect(body.reasoning_budget,).toBe(2048,);
  });

  test("passes tools through when present", () => {
    const tools: ToolDef[] = [
      { type: "function", function: { name: "f", description: "d", parameters: {}, }, },
    ];
    const body = buildBody(state, baseReq({ tools, },), false,);
    expect(body.tools,).toEqual(tools,);
  });

  test("forwards provider-specific params but not standard keys", () => {
    const body = buildBody(
      state,
      baseReq({
        params: {
          vendor_flag: "x",
          model: "should-not-override",
          temperature: 1,
        },
      },),
      false,
    );
    expect(body.vendor_flag,).toBe("x",);
    expect(body.model,).toBe("m1",);
    expect(body.temperature,).toBe(1,);
  });
});

// ── mapFinishReason ───────────────────────────────────────

describe("mapFinishReason", () => {
  test("maps stop and length", () => {
    expect(mapFinishReason("stop",),).toBe("stop",);
    expect(mapFinishReason("length",),).toBe("length",);
  });

  test("treats null/undefined/null-string as stop", () => {
    expect(mapFinishReason(undefined,),).toBe("stop",);
    expect(mapFinishReason(null,),).toBe("stop",);
    expect(mapFinishReason("null",),).toBe("stop",);
  });

  test("maps anything else to error", () => {
    expect(mapFinishReason("content_filter",),).toBe("error",);
    expect(mapFinishReason("tool_calls",),).toBe("error",);
  });
});

// ── handleErrorResponse ───────────────────────────────────

describe("handleErrorResponse", () => {
  test("throws ProviderAuthError for 401", async () => {
    const resp = Response.json({ error: { message: "bad key", }, }, {
      status: 401,
      headers: { "Content-Type": "application/json", },
    },);
    try {
      await handleErrorResponse(resp,);
      expect.unreachable();
    } catch (error) {
      expect(error,).toBeInstanceOf(ProviderAuthError,);
      expect((error as ProviderAuthError).statusCode,).toBe(401,);
    }
  });

  test("throws ProviderRateLimitError for 429 with retry-after", async () => {
    const resp = new Response("{}", {
      status: 429,
      headers: { "retry-after": "7", },
    },);
    try {
      await handleErrorResponse(resp,);
      expect.unreachable();
    } catch (error) {
      expect(error,).toBeInstanceOf(ProviderRateLimitError,);
      expect((error as ProviderRateLimitError).retryAfter,).toBe(7,);
      expect((error as ProviderRateLimitError).retryable,).toBe(true,);
    }
  });

  test("maps 400 and 422 to non-retryable errors", async () => {
    for (const status of [400, 422,]) {
      const resp = Response.json({ error: { message: "nope", }, }, { status, },);
      try {
        await handleErrorResponse(resp,);
        expect.unreachable();
      } catch (error) {
        expect(error,).toBeInstanceOf(ProviderError,);
        expect((error as ProviderError).statusCode,).toBe(status,);
        expect((error as ProviderError).retryable,).toBe(false,);
      }
    }
  });

  test("marks 5xx as retryable", async () => {
    for (const status of [500, 502, 503,]) {
      const resp = new Response("{}", { status, },);
      try {
        await handleErrorResponse(resp,);
        expect.unreachable();
      } catch (error) {
        expect((error as ProviderError).retryable,).toBe(true,);
      }
    }
  });

  test("falls back to statusText when the body is not JSON", async () => {
    const resp = new Response("<html>oops</html>", { status: 418, },);
    try {
      await handleErrorResponse(resp,);
      expect.unreachable();
    } catch (error) {
      expect((error as ProviderError).message,).toBe(resp.statusText,);
      expect((error as ProviderError).statusCode,).toBe(418,);
      expect((error as ProviderError).retryable,).toBe(false,);
    }
  });
});

// ── combineAbortSignals ───────────────────────────────────

describe("combineAbortSignals", () => {
  test("aborts the combined signal when any source aborts", () => {
    const a = new AbortController();
    const b = new AbortController();
    const combined = combineAbortSignals(a.signal, b.signal,);
    expect(combined.aborted,).toBe(false,);

    b.abort("reason-b",);
    expect(combined.aborted,).toBe(true,);
    expect(combined.reason,).toBe("reason-b",);
  });

  test("returns an already-aborted signal immediately", () => {
    const aborted = new AbortController();
    aborted.abort("pre",);
    const combined = combineAbortSignals(aborted.signal,);
    expect(combined.aborted,).toBe(true,);
    expect(combined.reason,).toBe("pre",);
  });

  test("returns a non-aborted signal when no source aborts", () => {
    const a = new AbortController();
    const combined = combineAbortSignals(a.signal,);
    expect(combined.aborted,).toBe(false,);
  });
});

// ── fetchRaw ──────────────────────────────────────────────

describe("fetchRaw", () => {
  async function withMockFetch(handler: FetchHandler, fn: () => Promise<void>,): Promise<void> {
    const originalFetch = globalThis.fetch;
    // eslint-disable-next-line unicorn/no-global-object-property-assignment
    (globalThis as Record<string, unknown>).fetch = handler;
    try {
      return await fn();
    } finally {
      // eslint-disable-next-line unicorn/no-global-object-property-assignment
      (globalThis as Record<string, unknown>).fetch = originalFetch;
    }
  }

  test("sends POST with JSON body, auth header, and state headers", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    await withMockFetch(
      async (url: string, init: RequestInit,) => {
        captured = { url, init, };
        return Response.json({ ok: true, }, { status: 200, },);
      },
      async () => {
        const resp = await fetchRaw(state, "https://provider.example/chat/completions", { a: 1, }, undefined,);
        expect(resp.ok,).toBe(true,);
      },
    );

    expect(captured?.url,).toBe("https://provider.example/chat/completions",);
    expect(captured?.init.method,).toBe("POST",);
    const headers = captured?.init.headers as Record<string, string>;
    expect(headers["Content-Type"],).toBe("application/json",);
    expect(headers.Authorization,).toBe("Bearer sk-test",);
    expect(headers["X-Custom"],).toBe("yes",);
    expect(JSON.parse(captured?.init.body as string,),).toEqual({ a: 1, },);
  });

  test("uses the api key override instead of the state key", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    await withMockFetch(
      async (_url: string, init: RequestInit,) => {
        capturedHeaders = init.headers as Record<string, string>;
        return new Response("{}", { status: 200, },);
      },
      async () => {
        await fetchRaw(state, "https://provider.example/x", { a: 1, }, undefined, "byo-key",);
      },
    );
    expect(capturedHeaders?.Authorization,).toBe("Bearer byo-key",);
  });

  test("omits the Authorization header when no key is configured", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const noKeyState: OpenAiCompatibleState = { ...state, apiKey: undefined, };
    await withMockFetch(
      async (_url: string, init: RequestInit,) => {
        capturedHeaders = init.headers as Record<string, string>;
        return new Response("{}", { status: 200, },);
      },
      async () => {
        await fetchRaw(noKeyState, "https://provider.example/x", { a: 1, }, undefined,);
      },
    );
    expect(capturedHeaders?.Authorization,).toBeUndefined();
  });

  test("sends GET when there is no body", async () => {
    let capturedMethod: string | undefined;
    await withMockFetch(
      async (_url: string, init: RequestInit,) => {
        capturedMethod = init.method;
        return new Response("{}", { status: 200, },);
      },
      async () => {
        await fetchRaw(state, "https://provider.example/x", undefined, undefined,);
      },
    );
    expect(capturedMethod,).toBe("GET",);
  });

  test("aborts the request after the configured timeout", async () => {
    const fastTimeoutState: OpenAiCompatibleState = { ...state, timeout: 30, };
    await withMockFetch(
      async (_url: string, init: RequestInit,) => {
        return new Promise<Response>((_resolve, reject,) => {
          const signal = init.signal;
          signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError",),);
          }, { once: true, },);
        },);
      },
      async () => {
        try {
          await fetchRaw(fastTimeoutState, "https://provider.example/x", { a: 1, }, undefined,);
          expect.unreachable();
        } catch (error) {
          expect((error as Error).name,).toBe("AbortError",);
        }
      },
    );
  });
});

// ── fetchWithRetry ────────────────────────────────────────

describe("fetchWithRetry", () => {
  async function withMockFetch(handler: FetchHandler, fn: () => Promise<void>,): Promise<void> {
    const originalFetch = globalThis.fetch;
    // eslint-disable-next-line unicorn/no-global-object-property-assignment
    (globalThis as Record<string, unknown>).fetch = handler;
    try {
      return await fn();
    } finally {
      // eslint-disable-next-line unicorn/no-global-object-property-assignment
      (globalThis as Record<string, unknown>).fetch = originalFetch;
    }
  }

  test("returns parsed JSON on the first successful attempt", async () => {
    await withMockFetch(
      async () => Response.json({ content: "hi", }, { status: 200, },),
      async () => {
        const data = await fetchWithRetry(state, "/chat/completions", { a: 1, }, undefined,);
        expect(data,).toEqual({ content: "hi", },);
      },
    );
  });

  test("retries a 500 and succeeds on the next attempt", async () => {
    let calls = 0;
    await withMockFetch(
      async () => {
        calls++;
        return calls === 1
          ? new Response("{}", { status: 500, },)
          : Response.json({ content: "recovered", }, { status: 200, },);
      },
      async () => {
        const data = await fetchWithRetry(state, "/chat/completions", { a: 1, }, undefined,);
        expect(data,).toEqual({ content: "recovered", },);
        expect(calls,).toBe(2,);
      },
    );
  }, 15_000,);

  test("throws immediately for non-retryable errors like 401", async () => {
    let calls = 0;
    await withMockFetch(
      async () => {
        calls++;
        return Response.json({ error: { message: "unauthorized", }, }, { status: 401, },);
      },
      async () => {
        try {
          await fetchWithRetry(state, "/chat/completions", { a: 1, }, undefined,);
          expect.unreachable();
        } catch (error) {
          expect(error,).toBeInstanceOf(ProviderAuthError,);
          expect(calls,).toBe(1,);
        }
      },
    );
  });

  test("throws Request cancelled when the caller aborts", async () => {
    const controller = new AbortController();
    await withMockFetch(
      async (_url: string, init: RequestInit,) => {
        controller.abort("user-cancel",);
        return new Promise<Response>((_resolve, reject,) => {
          if (init.signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError",),);
            return;
          }
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError",),);
          }, { once: true, },);
        },);
      },
      async () => {
        try {
          await fetchWithRetry(state, "/chat/completions", { a: 1, }, controller.signal,);
          expect.unreachable();
        } catch (error) {
          expect(error,).toBeInstanceOf(ProviderError,);
          expect((error as ProviderError).message,).toBe("Request cancelled",);
          expect((error as ProviderError).retryable,).toBe(false,);
        }
      },
    );
  });

  test("maps AbortError to a non-retryable timeout error", async () => {
    await withMockFetch(
      async () => {
        throw new DOMException("Aborted", "AbortError",);
      },
      async () => {
        try {
          await fetchWithRetry(state, "/chat/completions", { a: 1, }, undefined,);
          expect.unreachable();
        } catch (error) {
          expect(error,).toBeInstanceOf(ProviderError,);
          expect((error as ProviderError).message,).toBe("Request timed out",);
          expect((error as ProviderError).statusCode,).toBe(504,);
          expect((error as ProviderError).retryable,).toBe(false,);
        }
      },
    );
  });

  test("exhausts retries and rethrows the last error", async () => {
    let calls = 0;
    await withMockFetch(
      async () => {
        calls++;
        return new Response("{}", { status: 503, },);
      },
      async () => {
        try {
          await fetchWithRetry(state, "/chat/completions", { a: 1, }, undefined,);
          expect.unreachable();
        } catch (error) {
          expect(error,).toBeInstanceOf(ProviderError,);
          expect((error as ProviderError).statusCode,).toBe(503,);
          expect(calls,).toBe(2,);
        }
      },
    );
  }, 15_000,);
});
