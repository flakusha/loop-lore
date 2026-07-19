/**
 * Tests for generation/providers/types.ts — Provider error hierarchy
 */

import { describe, expect, test, } from "bun:test";
import { ProviderAuthError, ProviderError, ProviderRateLimitError, } from "./types";

describe("ProviderError", () => {
  test("creates basic error with message", () => {
    const err = new ProviderError("timeout",);
    expect(err.name,).toBe("ProviderError",);
    expect(err.message,).toBe("timeout",);
    expect(err.statusCode,).toBeUndefined();
    expect(err.retryable,).toBe(false,);
    expect(err instanceof Error,).toBe(true,);
  });

  test("creates error with status code", () => {
    const err = new ProviderError("not found", undefined, 404,);
    expect(err.statusCode,).toBe(404,);
    expect(err.retryable,).toBe(false,);
  });

  test("creates retryable error", () => {
    const err = new ProviderError("rate limited", undefined, 429, true, 30,);
    expect(err.statusCode,).toBe(429,);
    expect(err.retryable,).toBe(true,);
    expect(err.retryAfter,).toBe(30,);
  });

  test("accepts ErrorOptions", () => {
    const cause = new Error("upstream",);
    const err = new ProviderError("wrapped", { cause, }, 500, false,);
    expect(err.cause,).toBe(cause,);
  });
});

describe("ProviderAuthError", () => {
  test("default message is 'API key invalid'", () => {
    const err = new ProviderAuthError();
    expect(err.name,).toBe("ProviderAuthError",);
    expect(err.message,).toBe("API key invalid",);
    expect(err.statusCode,).toBe(401,);
    expect(err.retryable,).toBe(false,);
  });

  test("accepts custom message", () => {
    const err = new ProviderAuthError("bad credentials",);
    expect(err.message,).toBe("bad credentials",);
  });

  test("is instance of ProviderError", () => {
    const err = new ProviderAuthError();
    expect(err instanceof ProviderError,).toBe(true,);
    expect(err instanceof Error,).toBe(true,);
  });
});

describe("ProviderRateLimitError", () => {
  test("default message is 'Rate limited'", () => {
    const err = new ProviderRateLimitError();
    expect(err.name,).toBe("ProviderRateLimitError",);
    expect(err.message,).toBe("Rate limited",);
    expect(err.statusCode,).toBe(429,);
    expect(err.retryable,).toBe(true,);
  });

  test("stores retryAfter value", () => {
    const err = new ProviderRateLimitError(60,);
    expect(err.retryAfter,).toBe(60,);
  });

  test("is instance of ProviderError", () => {
    const err = new ProviderRateLimitError();
    expect(err instanceof ProviderError,).toBe(true,);
  });
});
