// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  isJsonString,
  jsonParseOr,
  jsonStringifyOr,
  safeJsonStringify,
} from "./safe-json";

describe("safe-json gaps — stringify options", () => {
  test("numeric space option indents output", () => {
    const r = safeJsonStringify({ a: 1, }, 2,);
    expect(r.ok,).toBe(true,);
    if (r.ok) { expect(r.value,).toBe('{\n  "a": 1\n}',); }
  });

  test("options object with space indents output", () => {
    const r = safeJsonStringify({ a: 1, }, { space: 2, },);
    expect(r.ok,).toBe(true,);
    if (r.ok) { expect(r.value,).toBe('{\n  "a": 1\n}',); }
  });

  test("guarded parses a JSON-string value before stringifying", () => {
    const r = safeJsonStringify('{"a":1}', { guarded: true, },);
    expect(r.ok,).toBe(true,);
    if (r.ok) {
      expect(r.value,).toBe('{"a":1}',);
      expect(JSON.parse(r.value,),).toEqual({ a: 1, },);
    }
  });

  test("guarded un-nests a double-stringified value", () => {
    const r = safeJsonStringify('"hello"', { guarded: true, },);
    expect(r.ok,).toBe(true,);
    if (r.ok) { expect(r.value,).toBe('"hello"',); }
  });

  test("guarded stringifies a non-JSON string as-is", () => {
    const r = safeJsonStringify("just text", { guarded: true, },);
    expect(r.ok,).toBe(true,);
    if (r.ok) { expect(r.value,).toBe('"just text"',); }
  });

  test("unguarded string value stringifies as-is (no parse attempt)", () => {
    const r = safeJsonStringify('{"a":1}',);
    expect(r.ok,).toBe(true,);
    if (r.ok) { expect(r.value,).toBe('"{\\"a\\":1}"',); }
  });

  test("non-Error throw in toJSON becomes an Error", () => {
    const bad = {
      toJSON: () => {
        throw "string-error";
      },
    };
    const r = safeJsonStringify(bad,);
    expect(r.ok,).toBe(false,);
    if (!r.ok) {
      expect(r.error,).toBeInstanceOf(Error,);
      expect(r.error.message,).toBe("string-error",);
    }
  });
});

describe("safe-json gaps — fallbacks and guards", () => {
  test("jsonParseOr returns parsed value on success", () => {
    expect(jsonParseOr<{ a: number }>('{"a":7}', { a: 0, },),).toEqual({ a: 7, },);
  });

  test("jsonParseOr returns fallback on invalid JSON", () => {
    expect(jsonParseOr("{bad", { a: 0, },),).toEqual({ a: 0, },);
  });

  test("jsonStringifyOr serializes on success", () => {
    expect(jsonStringifyOr({ a: 1, },),).toBe('{"a":1}',);
  });

  test("jsonStringifyOr returns fallback for circular input", () => {
    const a: { self?: unknown } = {};
    a.self = a;
    expect(jsonStringifyOr(a, "[]",),).toBe("[]",);
  });

  test("isJsonString accepts valid JSON strings", () => {
    expect(isJsonString('{"a":1}',),).toBe(true,);
    expect(isJsonString("[1,2]",),).toBe(true,);
    expect(isJsonString("42",),).toBe(true,);
  });

  test("isJsonString rejects invalid JSON strings", () => {
    expect(isJsonString("{bad",),).toBe(false,);
    expect(isJsonString("",),).toBe(false,);
  });

  test("isJsonString rejects non-strings", () => {
    expect(isJsonString(42,),).toBe(false,);
    expect(isJsonString(null,),).toBe(false,);
    expect(isJsonString({ a: 1, },),).toBe(false,);
  });
});
