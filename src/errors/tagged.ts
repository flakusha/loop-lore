// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tagged errors — typed, throwable error carriers.
 *
 * **Judgment: plain `Error` subclasses over `effect`'s `Data.TaggedError`.**
 * Effect's carriers buy structural equality plus `Effect.catchTag` composition
 * inside an `Effect` pipeline; this repo's two `effect` call sites (provider
 * retry, concurrency limiter) are isolated helpers and every HTTP error
 * surface is a plain try/catch or Elysia `onError` boundary where thrown
 * values are inspected directly — so the effect coupling would add nothing
 * while infecting every thrower/catcher with an `effect` import. What the
 * error-management goal needs — runtime misses converted into compile-time
 * exhaustiveness — comes from a literal `tag` discriminant plus mapped-type
 * records over a family's failure union, none of which require effect. If a
 * domain later adopts `Effect` pipelines, these classes still compose:
 * `Data.TaggedError`-shaped failures drop in behind `Effect.try`.
 *
 * Convention per family:
 *   1. Subclass `TaggedError` with a literal `tag` field (the discriminant).
 *   2. Export the family union, e.g.
 *      `export type ActorItemError = ItemNotFoundError | SlotConflictError`.
 *   3. Map every tag to an HTTP status in a mapped-type record,
 *      `{ [E in ActorItemError["tag"]]: number }` — adding a variant without
 *      a status is a compile error, which is the exhaustiveness guarantee.
 *
 * Services throw these for expected business denials (the
 * "Services: throw typed errors" rule in `.agents/references/recommendations.md`);
 * expected-failure `JsonResult` stays for leaf parsers (`safeJsonParse` & co).
 */
export abstract class TaggedError<Tag extends string = string,> extends Error {
  abstract readonly tag: Tag;

  constructor(message: string, options?: ErrorOptions,) {
    super(message, options,);
    this.name = new.target.name;
  }
}

/**
 * Type guard preserving narrowing: is this thrown value a tagged error (any family)?
 * @param value
 * @returns true when `value` is a `TaggedError`, narrowing it for the caller
 */
export function isTaggedError(value: unknown,): value is TaggedError<string> {
  return value instanceof TaggedError;
}

/** Literal tag type of a tagged-error union. */
export type TagOf<E extends TaggedError,> = E["tag"];

/**
 * Exhaustiveness guard for a `switch` over a family's tags — add a variant to
 * the union without a case and the `never` argument fails to compile.
 * @param tag - The unhandled tag (typed `never` when every case is handled)
 * @throws Always — this is the unreachable-case sentinel
 */
export function assertNeverTag(tag: never,): never {
  throw new Error(`Unhandled tagged error: ${String(tag,)}`,);
}
