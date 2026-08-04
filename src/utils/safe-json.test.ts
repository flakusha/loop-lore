/**
 * Tests for safe JSON utilities (src/utils/safe-json.ts).
 *
 * Covers the never-throw contract: safeJsonParse / safeJsonStringify return
 * a discriminated {ok, value|error} union; jsonParseOr / jsonStringifyOr
 * fall back instead of throwing; isJsonString discriminates valid JSON strings.
 */
import { describe, expect, test, } from "bun:test";
import {
  isJsonString,
  jsonParseOr,
  jsonStringifyOr,
  safeJsonParse,
  safeJsonStringify,
} from "./safe-json";

describe("safeJsonParse", () => {
  test("returns ok with parsed value for valid JSON", () => {
    const result = safeJsonParse(`{"a":1}`,);
    expect(result.ok,).toBe(true,);
    if (result.ok) {
      expect(result.value,).toEqual({ a: 1, },);
    }
  });

  test("parses primitives and arrays", () => {
    const arr = safeJsonParse("[1,2,3]",);
    expect(arr,).toEqual({ ok: true, value: [1, 2, 3,], },);
    const str = safeJsonParse(`"hi"`,);
    expect(str,).toEqual({ ok: true, value: "hi", },);
  });

  test("returns ok:false with an Error for invalid JSON", () => {
    const result = safeJsonParse("{ invalid",);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.error,).toBeInstanceOf(Error,);
    }
  });

  test("returns ok:false (never throws) for non-JSON input", () => {
    expect(() => safeJsonParse("undefined",)).not.toThrow();
    const result = safeJsonParse(undefined as unknown as string,);
    expect(result.ok,).toBe(false,);
  });

  test("wraps arbitrary thrown values into an Error", () => {
    // JSON.parse('') throws a SyntaxError; asError must still produce an Error.
    const result = safeJsonParse("",);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.error,).toBeInstanceOf(Error,);
    }
  });
});

describe("jsonParseOr", () => {
  test("returns the parsed value on success", () => {
    expect(jsonParseOr(`{"b":2}`, {},),).toEqual({ b: 2, },);
  });

  test("returns the fallback on parse failure", () => {
    expect(jsonParseOr("nope", { fallback: true, },),).toEqual({ fallback: true, },);
  });
});

describe("safeJsonStringify", () => {
  test("returns ok with a JSON string for a plain object", () => {
    const result = safeJsonStringify({ x: 1, },);
    expect(result,).toEqual({ ok: true, value: `{"x":1}`, },);
  });

  test("honours a numeric indentation (space)", () => {
    const result = safeJsonStringify({ a: 1, }, 2,);
    expect(result.ok,).toBe(true,);
    if (result.ok) {
      expect(result.value,).toContain("\n",);
      expect(result.value,).toContain('"a": 1',);
    }
  });

  test("guarded mode double-stringifies a valid JSON string and stringifies a non-JSON string as-is", () => {
    const guardedOk = safeJsonStringify(`{"a":1}`, { guarded: true, },);
    expect(guardedOk,).toEqual({ ok: true, value: `{"a":1}`, },);
    const guardedPlain = safeJsonStringify("plain text", { guarded: true, },);
    expect(guardedPlain,).toEqual({ ok: true, value: '"plain text"', },);
  });

  test("returns ok:false with an Error on circular references (never throws)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = safeJsonStringify(circular,);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.error,).toBeInstanceOf(Error,);
    }
  });

  test("un-guarded stringify returns a double-encoded string for a JSON string input", () => {
    const result = safeJsonStringify(`{"a":1}`,);
    expect(result,).toEqual({ ok: true, value: '"{\\"a\\":1}"', },);
  });
});

describe("jsonStringifyOr", () => {
  test("returns the serialized value on success", () => {
    expect(jsonStringifyOr({ a: 1, },),).toBe(`{"a":1}`,);
  });

  test("returns the fallback on failure (circular)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(jsonStringifyOr(circular, "[]",),).toBe("[]",);
  });

  test("defaults to the '{}' fallback", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(jsonStringifyOr(circular,),).toBe("{}",);
  });
});

describe("isJsonString", () => {
  test("returns true for a valid JSON string", () => {
    expect(isJsonString(`{"ok":true}`,),).toBe(true,);
    expect(isJsonString("[1]",),).toBe(true,);
  });

  test("returns false for non-strings", () => {
    expect(isJsonString(42,),).toBe(false,);
    expect(isJsonString(undefined,),).toBe(false,);
    expect(isJsonString(null,),).toBe(false,);
  });

  test("returns false for malformed JSON strings", () => {
    expect(isJsonString("{ nope",),).toBe(false,);
    expect(isJsonString("plain",),).toBe(false,);
  });
});
