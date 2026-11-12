// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-command valves (TASK-per-command-valves-like-options-schema) — a
 * TypeBox schema a command declares for its named arguments. The dispatcher
 * resolves the raw `--key value` map against it: converts numeric/boolean
 * strings, applies schema defaults, rejects unknown keys and type violations
 * with a structured error that lists the command's expected arguments
 * (Open WebUI Valves pattern).
 */

import type { TObject, TSchema, } from "@sinclair/typebox";
import { Value, } from "@sinclair/typebox/value";
import { jsonStringifyOr, } from "../../utils";

/** A valve value after conversion: strings stay strings, numbers/booleans coerce. */
export type ValveValue = string | number | boolean;

/**
 * One valve argument, summarized for API consumers (GET /api/commands, the
 * TUI hint strip). Deliberately free of TypeBox internals: consumers get
 * plain display fields, never a schema object.
 */
export interface CommandValveSpec {
  /** The `--key` name (without dashes). */
  name: string;
  /** Display type: "number", "boolean", a `a|b|c` literal union, or "text". */
  type: string;
  /** Schema default, when the property declares one. */
  default?: ValveValue;
  /** Literal-union vocabulary, when the property is a union of literals. */
  enum?: string[];
}

/**
 * Summarize a valve schema into per-argument display specs.
 * @param schema - The command's valve schema
 * @returns one spec per schema property, in declaration order
 */
export function valveSpecs(schema: TObject,): CommandValveSpec[] {
  return Object.entries(schema.properties,).map(([key, prop,],) => {
    const union: unknown = "anyOf" in prop ? prop.anyOf : undefined;
    const members: unknown[] | undefined = Array.isArray(union,) ? union : undefined;
    const enumValues = members === undefined
      ? undefined
      : members
        .map((entry,) => (entry !== null && typeof entry === "object" && "const" in entry ? entry.const : undefined))
        .filter((value,): value is string => typeof value === "string");

    const def: unknown = "default" in prop ? prop.default : undefined;
    const defaultSpec = typeof def === "string" || typeof def === "number" || typeof def === "boolean"
      ? { default: def, }
      : {};

    return {
      name: key,
      type: propertyKind(prop,),
      ...defaultSpec,
      ...(enumValues !== undefined && enumValues.length > 0 ? { enum: enumValues, } : {}),
    };
  },);
}

/** The dispatcher's valve resolution outcome. */
export type ValveOutcome =
  | { ok: true; values: Record<string, ValveValue> }
  | { ok: false; message: string };

/**
 * Human-readable type summary of one schema property (for usage text).
 * @param schema - Property schema
 * @returns "number", "boolean", "a|b|c" for literal unions, or "text"
 */
function propertyKind(schema: TSchema,): string {
  const type = schema.type;
  if (typeof type === "string") { return type; }
  const anyOf = (schema as { anyOf?: TSchema[] }).anyOf;
  if (Array.isArray(anyOf,)) {
    return anyOf
      .map((entry,) => (entry as { const?: unknown; type?: string }).const ?? propertyKind(entry,))
      .join("|",);
  }

  return "text";
}

/**
 * Summarize the expected named arguments of a valve schema, for the
 * structured rejection message and help text.
 * @param schema - The command's valve schema
 * @returns e.g. `--format (string, default "concise"), --count (number, default 10)`
 */
export function valveUsage(schema: TObject,): string {
  const properties = schema.properties as Record<string, TSchema>;
  return Object.entries(properties,).map(([key, prop,],) => {
    const kind = propertyKind(prop,);
    const def = (prop as { default?: unknown }).default;
    const defaultNote = def === undefined ? "" : `, default ${jsonStringifyOr(def, String(def,),)}`;
    return `--${key} (${kind}${defaultNote})`;
  },).join(", ",);
}

/**
 * Resolve raw named arguments against a command's valve schema.
 *
 * Order: unknown-key rejection → string conversion → defaults → check.
 * The returned values carry defaults, so handlers read them without
 * fallback chains.
 * @param input - Command name, schema, and the parsed named-arg map
 * @returns resolved values, or a structured rejection message
 */
export function resolveCommandValves(input: {
  command: string;
  schema: TObject;
  named: Record<string, string>;
},): ValveOutcome {
  const { command, schema, named, } = input;
  const known = new Set(Object.keys(schema.properties as Record<string, unknown>,),);
  const unknownKeys = Object.keys(named,).filter((key,) => !known.has(key,));
  if (unknownKeys.length > 0) {
    const listed = unknownKeys.map((key,) => `--${key}`).join(", ",);
    return {
      ok: false,
      message: `**Invalid arguments for /${command}:** unknown argument${
        unknownKeys.length === 1 ? "" : "s"
      } ${listed}. Expected: ${valveUsage(schema,)}`,
    };
  }

  // Value.Convert/Default operate on the object we hand them — the caller's
  // map stays untouched because we spread first.
  const candidate: Record<string, unknown> = { ...named, };
  Value.Default(schema, Value.Convert(schema, candidate,),);

  if (Value.Check(schema, candidate,)) {
    return { ok: true, values: candidate as Record<string, ValveValue>, };
  }

  const problems = Array.from(Value.Errors(schema, candidate,),)
    .map((err,) => `--${err.path.replace(/^\//, "",)}: ${err.message}`)
    .join("; ",);

  return {
    ok: false,
    message: `**Invalid arguments for /${command}:** ${problems}. Expected: ${valveUsage(schema,)}`,
  };
}
