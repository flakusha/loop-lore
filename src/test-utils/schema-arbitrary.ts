// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 260

import type { TSchema, } from "@sinclair/typebox";
import fc from "fast-check";
import { toDate, } from "../utils/date";

/** JSON Schema keywords this mapper reads, typed to avoid `any`. */
interface SchemaNode {
  type?: string;
  format?: string;
  enum?: unknown[];
  const?: unknown;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  maxItems?: number;
  maxProperties?: number;
  required?: string[];
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  anyOf?: SchemaNode[];
  oneOf?: SchemaNode[];
  allOf?: SchemaNode[];
  $ref?: string;
}

/** Default window for an unbounded integer; also the exclusive-bound base. */
const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

/** Dates outside this range stringify to extended-year forms most consumers reject. */
const DATE_MIN = toDate(Date.UTC(1000, 0, 1,),);
const DATE_MAX = toDate(Date.UTC(9999, 11, 31,),);

/**
 * Replace every `-0` leaf with `0`, at any depth.
 *
 * Both `fc.float` and `fc.jsonValue` emit `-0`, and `JSON.stringify(-0)` is
 * `"0"` — a stringify/parse round-trip then yields `+0`, which bun's
 * deep-equality distinguishes from `-0`. Normalising at the leaf producers
 * keeps the invariant instead of papering over it at every consumer.
 * @param value Any generated value, of any depth.
 * @returns The same value with every `-0` leaf replaced by `0`.
 */
const normalizeZeros = (value: unknown,): unknown => {
  if (typeof value === "number") { return Object.is(value, -0,) ? 0 : value; }

  if (Array.isArray(value,)) { return value.map(normalizeZeros,); }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value,).map(([k, v,],) => [k, normalizeZeros(v,),]),);
  }

  return value;
};

const asNode = (schema: TSchema,): SchemaNode => schema as unknown as SchemaNode;

const integerArb = (node: SchemaNode,): fc.Arbitrary<unknown> => {
  const declaredMin = node.exclusiveMinimum !== undefined ? node.exclusiveMinimum + 1 : node.minimum;
  const declaredMax = node.exclusiveMaximum !== undefined ? node.exclusiveMaximum - 1 : node.maximum;
  const min = Math.max(INT_MIN, declaredMin ?? INT_MIN,);
  const max = Math.min(INT_MAX, declaredMax ?? INT_MAX,);
  if (min >= max) { return fc.constant(min,); }

  return fc.integer({ min, max, },);
};

const numberArb = (node: SchemaNode,): fc.Arbitrary<unknown> => {
  const declared = {
    ...(node.minimum !== undefined ? { min: node.minimum, } : {}),
    ...(node.maximum !== undefined ? { max: node.maximum, } : {}),
    ...(node.exclusiveMinimum !== undefined ? { min: node.exclusiveMinimum + 1, } : {}),
    ...(node.exclusiveMaximum !== undefined ? { max: node.exclusiveMaximum - 1, } : {}),
  };

  if ((declared.min ?? 0) >= (declared.max ?? 0)) { return fc.constant(declared.min ?? 0,); }

  // `fc.float` emits `-0`; `normalizeZeros` scrubs it before it escapes.
  return fc.float({ ...declared, noNaN: true, noDefaultInfinity: true, },).map(normalizeZeros,);
};

const stringArb = (node: SchemaNode,): fc.Arbitrary<unknown> => {
  const lengths = { minLength: node.minLength, maxLength: node.maxLength, };
  switch (node.format) {
    case "uuid":
      return fc.uuid();
    case "email":
      return fc.emailAddress();
    case "uri":
    case "url":
      // ponytail: both share webUrl(); a format-specific grammar is only worth
      // it once a real schema demands one.
      return fc.webUrl();
    case "date-time":
      // ISO strings, not Date instances — the node says `type: "string"`.
      return fc.date({ min: DATE_MIN, max: DATE_MAX, noInvalidDate: true, },)
        .map((d,) => d.toISOString());
    case "date":
      return fc.date({ min: DATE_MIN, max: DATE_MAX, noInvalidDate: true, },)
        .map((d,) => d.toISOString().slice(0, 10,));
    default:
      return typeof node.pattern === "string"
        ? fc.stringMatching(new RegExp(node.pattern,), lengths,)
        : fc.string(lengths,);
  }
};

const arrayArb = (node: SchemaNode,): fc.Arbitrary<unknown> => {
  // A `Type.Recursive` $ref element cannot be generated without unbounded
  // recursion, and only the empty array is valid for it. ponytail: a schema
  // demanding minItems > 0 of a $ref element is unsatisfiable here by design.
  if (node.items !== undefined && typeof node.items.$ref === "string") { return fc.constant([],); }

  const item = schemaToArbitrary((node.items ?? {}) as TSchema,);
  // ponytail: maxItems capped at 10 to keep shrinking tractable — raise the cap
  // only once a real schema needs deeper arrays than that.
  const max = Math.min(node.maxItems ?? 10, 10,);

  return fc.array(item, { minLength: Math.min(node.minItems ?? 0, max,), maxLength: max, },);
};

const objectArb = (node: SchemaNode,): fc.Arbitrary<unknown> => {
  const properties = node.properties ?? {};
  const required = new Set(node.required ?? [],);
  const budget = node.maxProperties ?? Object.keys(properties,).length;
  const fields: Record<string, fc.Arbitrary<unknown>> = {};
  const keys: string[] = [];
  for (const [key, sub,] of Object.entries(properties,)) {
    if (keys.length >= budget) { break; }

    const arb = schemaToArbitrary(sub as TSchema,);
    // ponytail: additionalProperties (true or a subschema) emits no extra keys;
    // generating a key dictionary is only worth it once a schema needs it.
    fields[key] = required.has(key,) ? arb : fc.option(arb, { freq: 2, nil: undefined, },);
    keys.push(key,);
  }

  // `fc.option(nil: undefined)` leaves an omitted optional key present with an
  // undefined value; strip exactly those, never a key the schema requires.
  return fc.record(fields, { requiredKeys: keys.filter((k,) => required.has(k,)), },)
    .map((record,) =>
      Object.fromEntries(Object.entries(record,).filter(([k, v,],) => v !== undefined || required.has(k,)),)
    );
};

/**
 * Merge the node's own shape with its `allOf` branches into one object schema.
 *
 * @param node The schema node carrying `allOf`.
 * @returns One object node holding every merged property and required key.
 */
const mergeAllOf = (node: SchemaNode,): SchemaNode => {
  const properties: Record<string, SchemaNode> = { ...node.properties ?? {}, };
  const required = new Set(node.required ?? [],);
  for (const raw of node.allOf ?? []) {
    const sub = asNode(raw as TSchema,);
    Object.assign(properties, sub.properties ?? {},);
    for (const key of sub.required ?? []) { required.add(key,); }
  }

  return { type: "object", properties, required: [...required,], };
};

/**
 * Narrow an unknown barrel export to a TypeBox schema object.
 *
 * @param value Any barrel export.
 * @returns True when the value carries schema keywords.
 */
export function isTypeBoxSchema(value: unknown,): value is TSchema {
  if (typeof value !== "object" || value === null || Array.isArray(value,)) { return false; }
  const node = value as SchemaNode;

  if (typeof node.type === "string") { return true; }
  return node.enum !== undefined || "const" in node || Array.isArray(node.anyOf,) ||
    Array.isArray(node.oneOf,) || Array.isArray(node.allOf,);
}

/**
 * Map a TypeBox/JSON-Schema node to a fast-check arbitrary producing only valid values.
 *
 * Unconstrained nodes fall back to `fc.jsonValue()`, never `fc.anything()`:
 * `anything()` yields `undefined` ~2% of draws, and an `undefined` property
 * value is not JSON and fails `Value.Check`.
 *
 * @param schema The TypeBox/JSON-Schema node to map.
 * @returns An arbitrary producing only values that pass `Value.Check`.
 */
export function schemaToArbitrary(schema: TSchema,): fc.Arbitrary<unknown> {
  const node = asNode(schema,);
  if (node.enum !== undefined) { return fc.constantFrom(...node.enum,); }
  if ("const" in node) { return fc.constant(node.const,); }
  // A TypeBox `Type.Recursive` $ref would resolve forever; never chase it.
  if (typeof node.$ref === "string") { return fc.jsonValue().map(normalizeZeros,); }
  const branches = node.anyOf ?? node.oneOf;
  if (branches !== undefined) {
    // Elysia emits a string-coercion branch for numeric types; generating a
    // string there would violate the schema's numeric intent.
    const kept = branches.filter((b,) => b.type !== "string" || (b.format !== "integer" && b.format !== "numeric"));
    if (kept.length === 0) { return fc.jsonValue().map(normalizeZeros,); }
    return fc.oneof(...kept.map((b,) => schemaToArbitrary(b as TSchema,)),);
  }

  if (node.allOf !== undefined) { return schemaToArbitrary(mergeAllOf(node,) as TSchema,); }
  switch (node.type) {
    case "string":
      return stringArb(node,);
    case "integer":
      return integerArb(node,);
    case "number":
      return numberArb(node,);
    case "boolean":
      return fc.boolean();
    case "null":
      return fc.constant(null,);
    case "array":
      return arrayArb(node,);
    case "object":
      return objectArb(node,);
    case "Date":
      return fc.date({ noInvalidDate: true, },);
    default:
      return fc.jsonValue().map(normalizeZeros,);
  }
}

/**
 * True when the schema can produce values that survive JSON.stringify/parse deep-equality.
 *
 * @param schema The schema node to walk.
 * @returns False when any branch carries a Date, else true.
 */
export function isJsonRoundTrippable(schema: TSchema,): boolean {
  const node = asNode(schema,);
  if (node.type === "Date" || node.format === "date-time" || node.format === "date") {
    return false;
  }

  for (const list of [node.anyOf, node.oneOf, node.allOf,]) {
    if (list?.some((sub,) => !isJsonRoundTrippable(sub as TSchema,))) { return false; }
  }

  if (node.items !== undefined && !Array.isArray(node.items,)) {
    return isJsonRoundTrippable(node.items as TSchema,);
  }

  return Object.values(node.properties ?? {},).every((sub,) => isJsonRoundTrippable(sub as TSchema,));
}
