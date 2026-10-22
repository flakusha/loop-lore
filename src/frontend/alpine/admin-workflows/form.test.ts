import { describe, expect, test, } from "bun:test";
import { parseGraphField, pretty, readJsonArrayField, } from "./form";

describe("pretty", () => {
  test("pretty-prints objects", () => {
    expect(pretty({ a: 1, },),).toBe('{\n  "a": 1\n}',);
  });
});

describe("parseGraphField", () => {
  test("requires non-empty", () => {
    const errors: string[] = [];
    expect(parseGraphField("   ", errors,),).toBeNull();
    expect(errors,).toContain("Graph is required",);
  });

  test("accepts object", () => {
    const errors: string[] = [];
    expect(parseGraphField('{"a":1}', errors,),).toEqual({ a: 1, },);
  });
});

describe("readJsonArrayField", () => {
  test("blank returns undefined", () => {
    const errors: string[] = [];
    expect(readJsonArrayField("", "Parameters", errors,),).toBeUndefined();
  });

  test("returns array", () => {
    const errors: string[] = [];
    expect(readJsonArrayField("[1,2]", "Parameters", errors,),).toEqual([1, 2,],);
  });
});
