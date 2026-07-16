/**
 * Tests for frontend/alpine/json.ts — browser-safe JSON utilities
 */

import { describe, test, expect } from "bun:test";
import { safeJsonParse, safeJsonStringify, jsonParseOr, jsonBody } from "./json";

describe("safeJsonParse", () => {
  test("parses valid JSON object", () => {
    const result = safeJsonParse<{ a: number }>('{"a":1}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  test("parses valid JSON array", () => {
    const result = safeJsonParse<number[]>("[1,2,3]");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([1, 2, 3]);
  });

  test("parses valid JSON string", () => {
    const result = safeJsonParse<string>('"hello"');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("hello");
  });

  test("parses null", () => {
    const result = safeJsonParse<null>("null");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  test("parses boolean", () => {
    const result = safeJsonParse<boolean>("true");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(true);
  });

  test("parses number", () => {
    const result = safeJsonParse<number>("123");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(123);
  });

  test("returns error for invalid JSON", () => {
    const result = safeJsonParse("{ invalid }");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Error);
  });

  test("returns error for empty string", () => {
    const result = safeJsonParse("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Error);
  });

  test("returns error for non-JSON string", () => {
    const result = safeJsonParse("hello world");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Error);
  });
});

describe("safeJsonStringify", () => {
  test("stringifies valid object", () => {
    const result = safeJsonStringify({ a: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('{"a":1}');
  });

  test("stringifies array", () => {
    const result = safeJsonStringify([1, 2, 3]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("[1,2,3]");
  });

  test("stringifies null", () => {
    const result = safeJsonStringify(null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("null");
  });

  test("stringifies primitive string", () => {
    const result = safeJsonStringify("hello");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('"hello"');
  });

  test("stringifies primitive number", () => {
    const result = safeJsonStringify(123);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("123");
  });

  test("stringifies primitive boolean", () => {
    const result = safeJsonStringify(true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("true");
  });

  test("supports space parameter for pretty printing", () => {
    const result = safeJsonStringify({ a: 1 }, 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('{\n  "a": 1\n}');
  });

  test("handles circular reference gracefully", () => {
    const circular: { a: number; ref?: typeof circular } = { a: 1 };
    circular.ref = circular;
    const result = safeJsonStringify(circular);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Error);
  });
});

describe("jsonParseOr", () => {
  test("returns parsed value on success", () => {
    expect(jsonParseOr('{"a":1}', { a: 0 })).toEqual({ a: 1 });
  });

  test("returns fallback on failure", () => {
    expect(jsonParseOr("invalid", { a: 0 })).toEqual({ a: 0 });
  });
});

describe("jsonBody", () => {
  test("returns JSON string for valid data", () => {
    expect(jsonBody({ a: 1 })).toBe('{"a":1}');
  });

  test("throws on circular reference", () => {
    const circular: { a: number; ref?: typeof circular } = { a: 1 };
    circular.ref = circular;
    expect(() => jsonBody(circular)).toThrow();
  });
});
