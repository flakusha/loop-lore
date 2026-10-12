// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route error boundary — one place where a router family's tagged errors
 * become HTTP responses.
 *
 * Replaces the copy-pasted `try/catch → badRequestResponse(err.message)`
 * blocks: services throw `TaggedError` subclasses for expected business
 * denials, the family registers `.onError(taggedErrorBoundary({ ... }))`, and
 * every tag maps to its HTTP status through a mapped-type record that the
 * compiler forces to stay exhaustive. Unexpected errors (DB loss, invariant
 * violations) are logged with the family's module name and answered with a
 * generic 500 — the caller never sees internal error text.
 */
import { isTaggedError, type TaggedError, } from "../../errors/tagged";
import { getChildLogger, } from "../../logger";
import { asError, } from "../../utils";
import { jsonError, } from "./responses";
import type { HttpStatusCode, } from "./status";

/** Compile-checked tag → HTTP status table for one error family. */
export type ErrorStatusMap<E extends TaggedError,> = { [T in E["tag"]]: HttpStatusCode };

/** Options for {@link taggedErrorBoundary}. */
export interface TaggedBoundaryOptions<E extends TaggedError,> {
  /** Log module name for the family (structured `child({ module })`). */
  module: string;
  /** Every tag the family can throw, mapped to its HTTP status. */
  statusByTag: ErrorStatusMap<E>;
}

/**
 * Build an Elysia `onError` handler for one router family.
 * @param opts - Module name + the family's exhaustive tag→status map
 * @returns Handler mapping tagged errors to their status and every other
 *   thrown value to a logged, sanitized 500
 */
export function taggedErrorBoundary<E extends TaggedError,>(
  opts: TaggedBoundaryOptions<E>,
): (error: unknown,) => Response {
  const statusByTag = opts.statusByTag as Record<string, HttpStatusCode | undefined>;

  return (error: unknown,) => {
    if (isTaggedError(error,)) {
      const status = statusByTag[error.tag];
      if (status !== undefined) {
        return jsonError({ message: error.message, status, },);
      }
    }

    // getChildLogger (not getLogger) — the boundary must never throw on an
    // uninitialized logger (unit-test harnesses); the sanitized 500 below
    // still surfaces the failure to the caller.
    getChildLogger(opts.module,)?.error("Unhandled route error", asError(error,),);
    return jsonError({ message: "Internal server error", status: 500, },);
  };
}
