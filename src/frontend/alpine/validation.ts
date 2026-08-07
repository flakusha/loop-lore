/**
 * Browser-safe TypeBox validation helpers.
 *
 * Wraps `@sinclair/typebox/compiler` (TypeCompiler) with a per-schema cache and
 * `parseOr` fallback semantics that mirror `jsonParseOr` from `./json.ts`.
 * This is the in-place-validation seam: instead of `res.json() as Foo`, callers
 * decode the payload through a shared response schema so the wire shape is
 * verified at the trust boundary and the inferred `Static` type replaces the cast.
 *
 * `@sinclair/typebox` is pure ESM with no Node deps, so it bundles cleanly for
 * the browser (see scripts/build-frontend.mjs). Schemas come from
 * `src/validation/schemas/responses.ts`, which imports only TypeBox.
 */

import type { TSchema, } from "@sinclair/typebox";
import { type TypeCheck, TypeCompiler, type ValueError, } from "@sinclair/typebox/compiler";

/** Cache of compiled checkers, keyed by the schema object identity. */
const cache = new WeakMap<TSchema, TypeCheck<TSchema>>();

/**
 * Get (or compile + cache) the TypeCompiler checker for a schema.
 *
 * @param schema - TypeBox schema to compile
 * @returns compiled checker
 */
export function getChecker<T extends TSchema,>(schema: T,): TypeCheck<T> {
  let checker = cache.get(schema,) as TypeCheck<T> | undefined;
  if (!checker) {
    checker = TypeCompiler.Compile(schema,);
    cache.set(schema, checker,);
  }
  return checker;
}

/**
 * Strictly decode `value` against `schema`, returning `fallback` on mismatch.
 *
 * Never throws. On failure the first schema error is logged via console.warn
 * (the frontend has no logger at this layer) — set `onError` to customize.
 *
 * @param schema - shared response schema (from `../validation/schemas/responses`)
 * @param value - untrusted payload (e.g. `await res.json()`)
 * @param fallback - returned when `value` does not match `schema`
 * @param onError - optional callback receiving the first error
 * @returns `value` decoded to `Static<typeof schema>` or `fallback`
 */
export function parseOr<T extends TSchema,>(
  schema: T,
  value: unknown,
  fallback: import("@sinclair/typebox").Static<T>,
  onError?: (errors: ValueError[],) => void,
): import("@sinclair/typebox").Static<T> {
  const checker = getChecker(schema,);
  if (checker.Check(value,)) { return value as import("@sinclair/typebox").Static<T>; }
  const errors = [...checker.Errors(value,),];
  if (onError) { onError(errors,); }
  else {
    const first = errors[0];
    console.warn("parseOr: schema mismatch", { path: first?.path, message: first?.message, },);
  }
  return fallback;
}

/**
 * Strictly decode `value` against `schema`, throwing on mismatch.
 *
 * Useful where a bad payload must fail loudly rather than degrade to a
 * fallback. Throws `TypeBoxParseError` with the full error list.
 *
 * @param schema - shared response schema
 * @param value - untrusted payload
 * @returns `value` decoded to `Static<typeof schema>`
 * @throws {@link TypeBoxParseError} when `value` does not match `schema`
 */
export function parse<T extends TSchema,>(
  schema: T,
  value: unknown,
): import("@sinclair/typebox").Static<T> {
  const checker = getChecker(schema,);
  if (checker.Check(value,)) { return value as import("@sinclair/typebox").Static<T>; }
  throw new TypeBoxParseError(schema, value, [...checker.Errors(value,),],);
}

/** Error thrown by {@link parse} on schema mismatch. */
export class TypeBoxParseError extends Error {
  readonly errors: ValueError[];
  readonly schema: TSchema;

  constructor(schema: TSchema, _value: unknown, errors: ValueError[],) {
    const first = errors[0];
    super(`TypeBox parse failed at ${first?.path ?? "?"}: ${first?.message ?? "no errors"}`,);
    this.name = "TypeBoxParseError";
    this.schema = schema;
    this.errors = errors;
  }
}
