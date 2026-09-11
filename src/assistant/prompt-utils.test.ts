// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the JSON-with-fallback prompt helper. */
import { describe, expect, test, } from "bun:test";
import { parseJsonOr, } from "./prompt-utils";

describe("parseJsonOr", () => {
  test("nullish and empty input returns the fallback by identity", () => {
    const fallback = { a: 1, };
    expect(parseJsonOr(null, fallback,),).toBe(fallback,);
    expect(parseJsonOr(undefined, fallback,),).toBe(fallback,);
    expect(parseJsonOr("", fallback,),).toBe(fallback,);
  });

  test("valid JSON parses", () => {
    expect(parseJsonOr('{"a":1}', { a: 0, },),).toEqual({ a: 1, },);
  });

  test("invalid JSON returns the fallback", () => {
    const fallback = { a: 0, };
    expect(parseJsonOr("{oops", fallback,),).toBe(fallback,);
  });
});
