// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { TSchema, } from "@sinclair/typebox";
import { Value, } from "@sinclair/typebox/value";
import { describe, expect, test, } from "bun:test";
import { t, } from "elysia";
import fc from "fast-check";
import { isJsonRoundTrippable, isTypeBoxSchema, schemaToArbitrary, } from "./schema-arbitrary";

/** Every sample the mapper emits must satisfy the schema it came from. */
function checkAllValid(schema: TSchema, n = 50,): unknown[] {
  const samples = fc.sample(schemaToArbitrary(schema,), n,);
  for (const value of samples) {
    expect(Value.Check(schema, value,),).toBe(true,);
  }

  return samples;
}

const PRIMITIVES: Record<string, TSchema> = {
  string: t.String(),
  "bounded string": t.String({ minLength: 3, maxLength: 12, },),
  uuid: t.String({ format: "uuid", },),
  email: t.String({ format: "email", },),
  "date-time": t.String({ format: "date-time", },),
  date: t.String({ format: "date", },),
  uri: t.String({ format: "uri", },),
  pattern: t.String({ pattern: "^[A-Z]{3}-[0-9]{4}$", },),
  integer: t.Integer(),
  "bounded integer": t.Integer({ minimum: 0, maximum: 5, },),
  "exclusive integer": t.Integer({ exclusiveMinimum: 0, exclusiveMaximum: 5, },),
  number: t.Number(),
  "bounded number": t.Number({ minimum: -1, maximum: 1, },),
  boolean: t.Boolean(),
  null: t.Null(),
  array: t.Array(t.String(), { maxItems: 3, },),
  "non-empty array": t.Array(t.Integer(), { minItems: 1, maxItems: 2, },),
  object: t.Object({ a: t.String(), b: t.Integer(), },),
  "nested object": t.Object({ inner: t.Object({ x: t.Boolean(), },), },),
  union: t.Union([t.String(), t.Integer(),],),
  dateNode: t.Date(),
};

describe("schemaToArbitrary emits schema-valid values", () => {
  for (const [name, schema,] of Object.entries(PRIMITIVES,)) {
    test(`every sample of ${name} passes Value.Check`, () => {
      checkAllValid(schema,);
    });
  }
});

describe("Elysia numeric coercion quirk", () => {
  test("t.Integer never generates the string-coercion branch", () => {
    const schema = t.Integer({ minimum: 0, maximum: 5, },);
    for (const value of checkAllValid(schema, 200,)) {
      expect(typeof value,).toBe("number",);
      expect(value as number,).toBeGreaterThanOrEqual(0,);
      expect(value as number,).toBeLessThanOrEqual(5,);
    }
  });

  test("t.Numeric never generates the string-coercion branch", () => {
    const schema = t.Numeric({ minimum: 1, },);
    for (const value of checkAllValid(schema, 200,)) {
      expect(typeof value,).toBe("number",);
      expect(value as number,).toBeGreaterThanOrEqual(1,);
    }
  });

  test("exclusive bounds stay inside the open interval", () => {
    const schema = t.Integer({ exclusiveMinimum: 0, exclusiveMaximum: 4, },);
    for (const value of checkAllValid(schema, 200,)) {
      expect(value,).toBeGreaterThan(0,);
      expect(value,).toBeLessThan(4,);
    }
  });
});

describe("optional object properties", () => {
  test("optional keys are sometimes generated and sometimes omitted", () => {
    const schema = t.Object({ requiredKey: t.String(), optionalKey: t.Optional(t.Integer(),), },);
    let withOptional = 0;
    let withoutOptional = 0;
    for (const value of checkAllValid(schema, 300,)) {
      const record = value as Record<string, unknown>;
      if ("optionalKey" in record) { withOptional++; }
      else { withoutOptional++; }
    }

    expect(withOptional,).toBeGreaterThan(0,);
    expect(withoutOptional,).toBeGreaterThan(0,);
  });

  test("required keys are always present", () => {
    for (const value of checkAllValid(t.Object({ id: t.String(), },), 100,)) {
      expect(Object.keys(value as object,),).toEqual(["id",],);
    }
  });
});

describe("closed value sets", () => {
  test("enum emits only declared members", () => {
    const members = ["alpha", "beta", "gamma",] as [string, ...string[],];
    for (const value of checkAllValid(t.UnionEnum(members,), 200,)) {
      expect(members,).toContain(value as string,);
    }
  });

  test("const always emits the literal", () => {
    for (const value of checkAllValid(t.Literal("fixed",), 50,)) {
      expect(value,).toBe("fixed",);
    }
  });

  test("pattern strings always match the pattern", () => {
    const pattern = "^[A-Z]{3}-[0-9]{4}$";
    for (const value of checkAllValid(t.String({ pattern, },), 100,)) {
      expect(new RegExp(pattern,).test(value as string,),).toBe(true,);
    }
  });

  test("length bounds are honored", () => {
    for (const value of checkAllValid(t.String({ minLength: 5, maxLength: 7, },), 100,)) {
      expect((value as string).length,).toBeGreaterThanOrEqual(5,);
      expect((value as string).length,).toBeLessThanOrEqual(7,);
    }
  });
});

describe("structural keywords", () => {
  test("maxProperties caps the generated key count", () => {
    const schema = t.Object(
      { a: t.Optional(t.String(),), b: t.Optional(t.String(),), c: t.Optional(t.String(),), },
      { maxProperties: 2, },
    );

    for (const value of checkAllValid(schema, 100,)) {
      expect(Object.keys(value as object,).length,).toBeLessThanOrEqual(2,);
    }
  });

  test("allOf merges into one object shape", () => {
    const schema = t.Object({ a: t.String(), }, {
      allOf: [{ type: "object", properties: { b: { type: "integer", }, }, required: ["b",], },],
    },);

    for (const value of checkAllValid(schema, 50,)) {
      expect(Object.keys(value as object,).sort(),).toEqual(["a", "b",],);
    }
  });

  test("a self-referential $ref terminates instead of hanging", () => {
    const samples = fc.sample(schemaToArbitrary({ $ref: "#/properties/self", } as unknown as TSchema,), 500,);
    expect(samples,).toHaveLength(500,);
    // `fc.anything()` would inject `undefined` here; a JSON value never does.
    expect(samples.some((v,) => v === undefined),).toBe(false,);
  });

  test("an array of $ref items emits the valid empty array", () => {
    const schema = t.Object({ children: t.Array({ $ref: "T0", } as unknown as TSchema,), },);
    for (const value of checkAllValid(schema, 200,)) {
      expect((value as { children: unknown[] }).children,).toEqual([],);
    }
  });

  test("an unrecognized node still produces samples, never undefined", () => {
    const samples = fc.sample(schemaToArbitrary({} as TSchema,), 500,);
    expect(samples,).toHaveLength(500,);
    expect(samples.some((v,) => v === undefined),).toBe(false,);
  });

  test("an unconstrained required property is never dropped", () => {
    // Regression: `fc.anything()` yielded `undefined`, which the omit-filter
    // then deleted — a key the schema lists in `required` disappeared.
    const schema = t.Object({ value: t.Any(), },);
    for (const value of checkAllValid(schema, 500,)) {
      expect(Object.keys(value as object,),).toEqual(["value",],);
    }
  });
});

/** Every numeric leaf equal to `-0` (not merely negative). */
function negativeZeros(value: unknown, found: number[] = [],): number[] {
  if (typeof value === "number") {
    if (Object.is(value, -0,)) { found.push(value,); }
  } else if (Array.isArray(value,)) {
    for (const item of value) { negativeZeros(item, found,); }
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value,)) { negativeZeros(item, found,); }
  }

  return found;
}

describe("JSON round-trip safety", () => {
  test("no generated number is negative zero", () => {
    // Regression: `fc.float` emitted `-0`; `JSON.stringify(-0)` is `"0"`, so a
    // parsed round-trip yields `+0` and deep-equality fails.
    const schemas = [t.Number(), t.Number({ minimum: -5, maximum: 5, },), t.Any(), t.Object({ v: t.Number(), },),];
    for (const schema of schemas) {
      const offenders = fc.sample(schemaToArbitrary(schema,), 2000,).flatMap((v,) => negativeZeros(v,));
      expect(offenders.length,).toBe(0,);
    }
  });

  test("sampled values survive a stringify/parse deep-equality round-trip", () => {
    const schema = t.Object({ n: t.Number(), s: t.String(), list: t.Array(t.Number(),), },);
    for (const value of checkAllValid(schema, 500,)) {
      expect(JSON.parse(JSON.stringify(value,),),).toEqual(value,);
    }
  });
});

describe("isJsonRoundTrippable", () => {
  test("false for t.Date()", () => {
    expect(isJsonRoundTrippable(t.Date(),),).toBe(false,);
  });

  test("false when a nested property is a date", () => {
    expect(isJsonRoundTrippable(t.Object({ at: t.Date(), },),),).toBe(false,);
  });

  test("false for a date-time formatted string", () => {
    expect(isJsonRoundTrippable(t.String({ format: "date-time", },),),).toBe(false,);
  });

  test("true for plain strings, ints, objects and arrays", () => {
    expect(isJsonRoundTrippable(t.Object({ a: t.String(), b: t.Integer(), },),),).toBe(true,);
    expect(isJsonRoundTrippable(t.Array(t.Integer({ minimum: 0, maximum: 3, },),),),).toBe(true,);
  });
});

describe("isTypeBoxSchema", () => {
  test("true for schema-shaped values", () => {
    expect(isTypeBoxSchema(t.String(),),).toBe(true,);
    expect(isTypeBoxSchema(t.Object({ a: t.String(), },),),).toBe(true,);
    expect(isTypeBoxSchema({ enum: ["a",], },),).toBe(true,);
    expect(isTypeBoxSchema({ const: 1, },),).toBe(true,);
    expect(isTypeBoxSchema({ anyOf: [{ type: "string", },], },),).toBe(true,);
    expect(isTypeBoxSchema({ oneOf: [{ type: "string", },], },),).toBe(true,);
    expect(isTypeBoxSchema({ allOf: [{ type: "object", },], },),).toBe(true,);
  });

  test("false for functions, classes, primitives, arrays and undefined", () => {
    expect(isTypeBoxSchema(undefined,),).toBe(false,);
    expect(isTypeBoxSchema(null,),).toBe(false,);
    expect(isTypeBoxSchema(42,),).toBe(false,);
    expect(isTypeBoxSchema("string",),).toBe(false,);
    expect(isTypeBoxSchema(true,),).toBe(false,);
    expect(isTypeBoxSchema([],),).toBe(false,);
    expect(isTypeBoxSchema(() => 1),).toBe(false,);
    expect(isTypeBoxSchema(class Schema {},),).toBe(false,);
    expect(isTypeBoxSchema({},),).toBe(false,);
  });
});

describe("determinism", () => {
  test("a fixed seed reproduces the same samples", () => {
    // The 2-arity form re-randomizes; `{ seed, numRuns }` is the seeded form.
    const schema = t.Object({ a: t.String({ minLength: 2, maxLength: 6, },), b: t.Integer(), },);
    const first = fc.sample(schemaToArbitrary(schema,), { seed: 1234, numRuns: 25, },);
    expect(fc.sample(schemaToArbitrary(schema,), { seed: 1234, numRuns: 25, },),).toEqual(first,);
  });
});
