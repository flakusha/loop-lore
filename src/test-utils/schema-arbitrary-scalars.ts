// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { TSchema, } from "@sinclair/typebox";
import fc from "fast-check";
import { toDate, } from "../utils/date";

/** JSON Schema keywords this mapper reads, typed to avoid `any`. */
export interface SchemaNode {
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
  additionalProperties?: SchemaNode | boolean;
  patternProperties?: Record<string, SchemaNode>;
  anyOf?: SchemaNode[];
  oneOf?: SchemaNode[];
  allOf?: SchemaNode[];
  $ref?: string;
}

export const asNode = (schema: TSchema,): SchemaNode => schema as unknown as SchemaNode;

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
export const normalizeZeros = (value: unknown,): unknown => {
  if (typeof value === "number") { return Object.is(value, -0,) ? 0 : value; }

  if (Array.isArray(value,)) { return value.map(normalizeZeros,); }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value,).map(([k, v,],) => [k, normalizeZeros(v,),]),);
  }

  return value;
};

export const integerArb = (node: SchemaNode,): fc.Arbitrary<unknown> => {
  const declaredMin = node.exclusiveMinimum !== undefined ? node.exclusiveMinimum + 1 : node.minimum;
  const declaredMax = node.exclusiveMaximum !== undefined ? node.exclusiveMaximum - 1 : node.maximum;
  const min = Math.max(INT_MIN, declaredMin ?? INT_MIN,);
  const max = Math.min(INT_MAX, declaredMax ?? INT_MAX,);
  if (min > max) { throw new Error(`unsatisfiable bounds: minimum ${min} > maximum ${max}`,); }
  if (min === max) { return fc.constant(min,); }

  return fc.integer({ min, max, },);
};

export const numberArb = (node: SchemaNode,): fc.Arbitrary<unknown> => {
  const declared = {
    ...(node.minimum !== undefined ? { min: node.minimum, } : {}),
    ...(node.maximum !== undefined ? { max: node.maximum, } : {}),
    ...(node.exclusiveMinimum !== undefined ? { min: node.exclusiveMinimum + 1, } : {}),
    ...(node.exclusiveMaximum !== undefined ? { max: node.exclusiveMaximum - 1, } : {}),
  };

  // An ABSENT bound is unbounded, not 0: `?? 0` made every "minimum only" or
  // unconstrained number collapse to a constant, and the fuzz test went blind.
  if (declared.min !== undefined && declared.max !== undefined && declared.min > declared.max) {
    throw new Error(`unsatisfiable bounds: minimum ${declared.min} > maximum ${declared.max}`,);
  }

  // `fc.float` emits `-0`; `normalizeZeros` scrubs it before it escapes.
  return fc.float({ ...declared, noNaN: true, noDefaultInfinity: true, },).map(normalizeZeros,);
};

export const stringArb = (node: SchemaNode,): fc.Arbitrary<unknown> => {
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
    default: {
      if (typeof node.pattern !== "string") { return fc.string(lengths,); }
      // `stringMatching` accepts `maxLength` but NOT `minLength`; passing it in
      // silently drops it and the mapper emits length-violating values.
      const min = node.minLength ?? 0;
      const matching = fc.stringMatching(
        new RegExp(node.pattern,),
        node.maxLength === undefined ? {} : { maxLength: node.maxLength, },
      );

      return min > 0 ? matching.filter((s,) => s.length >= min) : matching;
    }
  }
};
