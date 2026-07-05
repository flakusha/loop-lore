import { describe, test, expect } from "bun:test";
import {
  safeJsonParse,
  safeJsonStringify,
  isJsonString,
  jsonParseOr,
} from "./utils";

describe("safeJsonParse", () => {
  test("parses valid JSON", () => {
    const result = safeJsonParse<{ a: number }>('{"a":1}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ a: 1 });
  });

  test("returns error for invalid JSON", () => {
    const result = safeJsonParse("{ invalid }");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(Error);
  });
});

describe("safeJsonStringify", () => {
  test("stringifies valid objects", () => {
    const result = safeJsonStringify({ a: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('{"a":1}');
  });

  test("handles null", () => {
    const result = safeJsonStringify(null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("null");
  });

  test("handles arrays", () => {
    const result = safeJsonStringify([1, 2, 3]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("[1,2,3]");
  });

  test("supports space parameter", () => {
    const result = safeJsonStringify({ a: 1 }, 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('{\n  "a": 1\n}');
  });

  test("supports options object with space", () => {
    const result = safeJsonStringify({ a: 1 }, { space: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('{\n  "a": 1\n}');
  });

  test("guarded option prevents double-encoding", () => {
    const input = '{"test":1}';
    const result = safeJsonStringify(input, { guarded: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('{"test":1}');
  });

  test("guarded option with space parameter", () => {
    const input = '{"test":1}';
    const result = safeJsonStringify(input, { guarded: true, space: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('{\n  "test": 1\n}');
  });

  test("guarded option handles non-JSON strings", () => {
    const result = safeJsonStringify("hello", { guarded: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('"hello"');
  });

  test("guarded option handles non-string values", () => {
    const result = safeJsonStringify({ a: 1 }, { guarded: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('{"a":1}');
  });
});

describe("isJsonString", () => {
  test("returns true for valid JSON strings", () => {
    expect(isJsonString('{"a":1}')).toBe(true);
    expect(isJsonString("[1,2,3]")).toBe(true);
    expect(isJsonString('"hello"')).toBe(true);
    expect(isJsonString("null")).toBe(true);
    expect(isJsonString("true")).toBe(true);
    expect(isJsonString("123")).toBe(true);
  });

  test("returns false for non-JSON strings", () => {
    expect(isJsonString("hello")).toBe(false);
    expect(isJsonString("not json")).toBe(false);
    expect(isJsonString("")).toBe(false);
  });

  test("returns false for non-string values", () => {
    expect(isJsonString(123)).toBe(false);
    expect(isJsonString(null)).toBe(false);
    expect(isJsonString(undefined)).toBe(false);
    expect(isJsonString({})).toBe(false);
    expect(isJsonString([])).toBe(false);
  });
});

describe("safeJsonStringify (guarded)", () => {
  test("stringifies non-string values directly", () => {
    const result = safeJsonStringify({ a: 1 }, { guarded: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('{"a":1}');
  });

  test("parses JSON strings before stringifying (prevents double-encoding)", () => {
    const result = safeJsonStringify('{"a":1}', { guarded: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('{"a":1}');
  });

  test("stringifies non-JSON strings as-is", () => {
    const result = safeJsonStringify("hello", { guarded: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('"hello"');
  });

  test("handles nested JSON strings", () => {
    const nested = String.raw`{"outer":"{\"inner\":1}"}`;
    const result = safeJsonStringify(nested, { guarded: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(nested);
  });

  test("handles arrays", () => {
    const result = safeJsonStringify([1, 2, 3]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("[1,2,3]");
  });

  test("handles JSON array strings", () => {
    const result = safeJsonStringify("[1,2,3]", { guarded: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("[1,2,3]");
  });

  test("handles null", () => {
    const result = safeJsonStringify(null, { guarded: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("null");
  });

  test("handles null JSON string", () => {
    const result = safeJsonStringify("null", { guarded: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("null");
  });

  test("handles circular references gracefully", () => {
    const circular: { a: number; ref?: typeof circular } = { a: 1 };
    circular.ref = circular;
    const result = safeJsonStringify(circular, { guarded: true });
    expect(result.ok).toBe(false);
  });

  test("supports space parameter", () => {
    const result = safeJsonStringify({ a: 1 }, { guarded: true, space: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('{\n  "a": 1\n}');
  });

  test("supports space parameter with JSON string input", () => {
    const result = safeJsonStringify('{"a":1}', { guarded: true, space: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('{\n  "a": 1\n}');
  });
});

describe("jsonParseOr", () => {
  test("returns parsed value for valid JSON", () => {
    const result = jsonParseOr('{"a":1}', { a: 0 });
    expect(result).toEqual({ a: 1 });
  });

  test("returns fallback for invalid JSON", () => {
    const result = jsonParseOr("not json", { a: 0 });
    expect(result).toEqual({ a: 0 });
  });

  test("returns parsed value for valid JSON array", () => {
    const result = jsonParseOr<number[]>("[1,2,3]", []);
    expect(result).toEqual([1, 2, 3]);
  });
});

describe("double-encoding prevention", () => {
  test("prevents double-encoding with safeJsonStringify (guarded)", () => {
    const input = '{"nested":{"object":true},"arr":[1,2,3]}';
    const result = safeJsonStringify(input, { guarded: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(input);
  });

  test("safeJsonStringify double-encodes JSON strings", () => {
    const input = '{"test":1}';
    const result = safeJsonStringify(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBe(input);
      expect(result.value).toBe(String.raw`"{\"test\":1}"`);
    }
  });

  test("guarded version prevents this", () => {
    const input = '{"test":1}';
    const result = safeJsonStringify(input, { guarded: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('{"test":1}');
  });
});
