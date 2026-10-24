// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for the Google Translate HTTP layer: abort-signal combination, the
// API-key guard, and the error mapping (401/403, 429 + retry-after, 5xx,
// other 4xx).
import { describe, expect, test, } from "bun:test";
import { ProviderError, } from "../types";
import { combineAbortSignals, fetchRaw, handleErrorResponse, } from "./http";
import type { GoogleTranslateState, } from "./types";

const state: GoogleTranslateState = {
  baseUrl: "https://translation.googleapis.com",
  apiKey: "g-key",
  defaultModel: "en",
  timeout: 5000,
  retries: 1,
  headers: {},
};

// ── combineAbortSignals ────────────────────────────────────

describe("combineAbortSignals", () => {
  test("returns undefined when no signal is defined", () => {
    expect(combineAbortSignals(undefined, undefined,),).toBeUndefined();
  });

  test("propagates an already-aborted signal immediately", () => {
    const aborted = AbortSignal.abort(new Error("gone",),);
    expect(combineAbortSignals(aborted,)?.aborted,).toBe(true,);
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
    await fetchRaw({ ...state, apiKey: "", }, "/language/translate/v2", undefined,)
      .then(
        () => expect.unreachable(),
        (error: unknown,) => {
          expect(error,).toBeInstanceOf(ProviderError,);
          expect((error as ProviderError).statusCode,).toBe(401,);
          expect((error as ProviderError).retryable,).toBe(false,);
          expect((error as ProviderError).message,).toContain("requires an API key",);
        },
      );
  });
});

// ── handleErrorResponse ────────────────────────────────────

describe("handleErrorResponse", () => {
  test("maps the Google error envelope to a non-retryable error", async () => {
    await handleErrorResponse(
      Response.json({ error: { code: 403, message: "API key not valid", status: "PERMISSION_DENIED", }, }, {
        status: 403,
      },),
    )
      .then(
        () => expect.unreachable(),
        (error: unknown,) => {
          expect(error,).toBeInstanceOf(ProviderError,);
          expect((error as ProviderError).statusCode,).toBe(403,);
          expect((error as ProviderError).retryable,).toBe(false,);
          expect((error as ProviderError).message,).toBe("API key not valid",);
        },
      );
  });

  test("falls back to the status message when the error body is not JSON", async () => {
    await handleErrorResponse(new Response("not json", { status: 400, },),)
      .then(
        () => expect.unreachable(),
        (error: unknown,) => {
          expect((error as ProviderError).statusCode,).toBe(400,);
          expect((error as ProviderError).retryable,).toBe(false,);
          expect((error as ProviderError).message,).toContain("Google Translate request failed (400)",);
        },
      );
  });

  test("maps a 429 to a retryable error carrying the retry-after delay", async () => {
    const response = new Response(JSON.stringify({ error: { message: "Quota exceeded", }, },), {
      status: 429,
      headers: { "retry-after": "5", },
    },);

    await handleErrorResponse(response,)
      .then(
        () => expect.unreachable(),
        (error: unknown,) => {
          expect((error as ProviderError).statusCode,).toBe(429,);
          expect((error as ProviderError).retryable,).toBe(true,);
          expect((error as ProviderError).retryAfter,).toBe(5,);
        },
      );
  });

  test("maps a 5xx to a retryable error", async () => {
    await handleErrorResponse(Response.json({ error: { message: "Backend error", }, }, { status: 503, },),)
      .then(
        () => expect.unreachable(),
        (error: unknown,) => {
          expect((error as ProviderError).statusCode,).toBe(503,);
          expect((error as ProviderError).retryable,).toBe(true,);
          expect((error as ProviderError).message,).toBe("Backend error",);
        },
      );
  });
});
