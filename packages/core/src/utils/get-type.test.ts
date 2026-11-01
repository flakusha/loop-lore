// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for src/utils/get-type.ts.
 */
import { describe, expect, test, } from "bun:test";
import { getType, } from "./get-type.ts";

describe("getType", () => {
  test("returns 'string' for string values", () => {
    expect(getType("hello",),).toBe("string",);
    expect(getType("",),).toBe("string",);
    expect(getType("abc123",),).toBe("string",);
  });

  test("returns 'number' for number values", () => {
    expect(getType(0,),).toBe("number",);
    expect(getType(123,),).toBe("number",);
    expect(getType(-456,),).toBe("number",);
    expect(getType(3.14,),).toBe("number",);
    expect(getType(NaN,),).toBe("number",);
    expect(getType(Infinity,),).toBe("number",);
  });

  test("returns 'boolean' for boolean values", () => {
    expect(getType(true,),).toBe("boolean",);
    expect(getType(false,),).toBe("boolean",);
  });

  test("returns 'undefined' for undefined", () => {
    expect(getType(undefined,),).toBe("undefined",);
  });

  test("returns 'null' for null", () => {
    expect(getType(null,),).toBe("null",);
  });

  test("returns 'function' for functions", () => {
    expect(getType(function() {},),).toBe("function",);
    expect(getType(() => {},),).toBe("function",);
    expect(getType(async () => {},),).toBe("function",);
    expect(getType(function*() {},),).toBe("function",);
  });

  test("returns 'symbol' for symbols", () => {
    expect(getType(Symbol("test",),),).toBe("symbol",);
  });

  test("returns 'bigint' for bigint values", () => {
    expect(getType(BigInt(123,),),).toBe("bigint",);
  });

  test("returns 'array' for arrays", () => {
    expect(getType([],),).toBe("array",);
    expect(getType([1, 2, 3,],),).toBe("array",);
    expect(getType(new Array(5,),),).toBe("array",);
  });

  test("returns 'object' for plain objects", () => {
    expect(getType({},),).toBe("object",);
    expect(getType({ a: 1, },),).toBe("object",);
  });

  test("returns 'date' for Date instances", () => {
    expect(getType(new Date(),),).toBe("date",);
    expect(getType(new Date("2024-01-01",),),).toBe("date",);
  });

  test("returns 'regExp' for RegExp instances", () => {
    expect(getType(/foo/,),).toBe("regExp",);
    expect(getType(new RegExp("bar",),),).toBe("regExp",);
  });

  test("returns 'array' for object arguments to Array", () => {
    expect(getType(new (class Foo {})(),),).toBe("object",);
  });
});
