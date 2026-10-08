// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the leaf arbitraries, driven from a raw `SchemaNode`.
 *
 * `schema-arbitrary.test.ts` reaches the same code through `schemaToArbitrary`,
 * so it can only ever hand it a TypeBox schema. These pin the raw JSON-Schema
 * node entry the mapper itself uses — an exclusive bound alone, a bare pattern
 * with no length window, `-0` buried under nested arrays — none of which any
 * TypeBox builder in the other suite can express.
 */
import { describe, expect, test, } from "bun:test";
import fc from "fast-check";
import { asNode, integerArb, normalizeZeros, numberArb, stringArb, } from "./schema-arbitrary-scalars";

describe("asNode", () => {
  test("reads the keywords off a plain JSON-Schema object", () => {
    const node = asNode({ type: "string", minLength: 3, maxLength: 5, } as never,);

    expect(node.type,).toBe("string",);
    expect(node.minLength,).toBe(3,);
    expect(node.maxLength,).toBe(5,);
  });
});

describe("normalizeZeros", () => {
  test("replaces -0 at any depth and leaves every other number alone", () => {
    const normalized = normalizeZeros({ a: [-0, 1, -1.5,], b: { c: -0, }, },) as {
      a: number[];
      b: { c: number };
    };

    expect(normalized,).toEqual({ a: [0, 1, -1.5,], b: { c: 0, }, },);
    expect(Object.is(normalized.a[0], -0,),).toBe(false,);
  });

  test("passes non-numeric leaves through unchanged", () => {
    expect(normalizeZeros(null,),).toBe(null,);
    expect(normalizeZeros("x",),).toBe("x",);
    expect(normalizeZeros(undefined,),).toBe(undefined,);
  });
});

describe("integerArb on a raw node", () => {
  test("an exclusive-only window stays strictly inside both bounds", () => {
    for (const value of fc.sample(integerArb({ exclusiveMinimum: -2, exclusiveMaximum: 2, },), 200,) as number[]) {
      expect(value,).toBeGreaterThan(-2,);
      expect(value,).toBeLessThan(2,);
    }
  });

  test("a degenerate window emits its one valid value instead of throwing", () => {
    expect(fc.sample(integerArb({ minimum: 7, maximum: 7, },), 10,),).toEqual(Array.from({ length: 10, }, () => 7,),);
  });

  test("a contradictory window throws rather than emitting an invalid value", () => {
    expect(() => integerArb({ minimum: 5, maximum: 3, },)).toThrow(/unsatisfiable bounds/,);
  });
});

describe("numberArb on a raw node", () => {
  test("an absent bound is unbounded on both sides and never yields -0", () => {
    const samples = fc.sample(numberArb({},), 200,) as number[];

    expect(samples.some((value,) => value < 0),).toBe(true,);
    expect(samples.some((value,) => value > 0),).toBe(true,);
    expect(samples.every((value,) => !Object.is(value, -0,)),).toBe(true,);
  });
});

describe("stringArb on a raw node", () => {
  test("a bare pattern with a minLength filter honours both", () => {
    const arb = stringArb({ pattern: "^[a-z]+$", minLength: 4, maxLength: 8, },);
    for (const value of fc.sample(arb, 200,) as string[]) {
      expect(value,).toMatch(/^[a-z]+$/,);
      expect(value.length,).toBeGreaterThanOrEqual(4,);
      expect(value.length,).toBeLessThanOrEqual(8,);
    }
  });

  test("a format drives the emitted shape", () => {
    expect(fc.sample(stringArb({ format: "email", },), 20,)[0],).toContain("@",);
    expect(fc.sample(stringArb({ format: "uri", },), 20,)[0],).toContain("://",);

    const dates = fc.sample(stringArb({ format: "date", },), 20,) as string[];
    expect(dates.every((value,) => value.length === 10 && value[4] === "-"),).toBe(true,);

    const stamps = fc.sample(stringArb({ format: "date-time", },), 20,) as string[];
    expect(stamps.every((value,) => value.includes("T",) && value.endsWith("Z",)),).toBe(true,);
  });
});
