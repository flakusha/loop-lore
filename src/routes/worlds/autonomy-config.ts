// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { EMPTY_AUTONOMY_OVERRIDE, } from "../../autonomy/config";
import { jsonStringifyOr, safeJsonParse, } from "../../utils/safe-json";
import { HttpStatus, jsonError, } from "../http-utils";

type AutonomyUpdateResult =
  | { ok: true; value: string | null | undefined }
  | { ok: false; error: Response };

/**
 * Reject a non-integer `seed` before it reaches the TEXT column. The
 * seed feeds `hashSeed`'s `String(part)` and `mulberry32`'s `seed >>> 0`,
 * so an unvalidated value coerces rather than fails - a string or float
 * would silently make an organic world deterministic. `null` is legal:
 * it is how a layer un-seeds a seeded lower layer.
 *
 * @param raw the request field, if present
 * @returns {Response | null} the 400 to return, or null when acceptable
 */
function badSeed(raw: unknown,): Response | null {
  let blob: unknown = raw;
  if (typeof raw === "string") {
    const parsed = safeJsonParse<unknown>(raw,);
    // Unparseable JSON is the caller's existing 400, not a seed problem.
    if (!parsed.ok) { return null; }
    blob = parsed.value;
  }

  if (typeof blob !== "object" || blob === null) { return null; }
  const seed = (blob as Record<string, unknown>).seed;
  if (seed === undefined || seed === null) { return null; }
  if (typeof seed === "number" && Number.isInteger(seed,)) { return null; }
  return jsonError({
    message: "autonomyConfig.seed must be an integer or null",
    status: HttpStatus.BadRequest,
  },);
}

/**
 * Normalise an `autonomyConfig` request field for the `worlds.autonomy_config`
 * TEXT column.
 *
 * `undefined` means "field absent" and yields `value: undefined` so the caller
 * leaves the column untouched. `null` / `""` clears the world layer: the
 * column is `NOT NULL DEFAULT '{}'` (migration 022) and the resolver reads
 * `{}` as "no override", so clearing writes `{}` rather than SQL NULL. A
 * string must be valid JSON - storing an unparseable blob would make the
 * tick resolver silently ignore the override. A `seed` must be an integer
 * or `null`; see `badSeed`.
 *
 * @param raw - the request field, if present
 * @returns {AutonomyUpdateResult}
 */
export function autonomyUpdate(raw: unknown,): AutonomyUpdateResult {
  if (raw === undefined) { return { ok: true, value: undefined, }; }
  if (raw === null || raw === "") { return { ok: true, value: EMPTY_AUTONOMY_OVERRIDE, }; }
  if (typeof raw === "string") {
    if (!safeJsonParse<unknown>(raw,).ok) {
      return {
        ok: false,
        error: jsonError({
          message: "autonomyConfig must be valid JSON",
          status: HttpStatus.BadRequest,
        },),
      };
    }

    const seedError = badSeed(raw,);
    if (seedError) { return { ok: false, error: seedError, }; }
    return { ok: true, value: raw, };
  }

  if (typeof raw === "object") {
    const seedError = badSeed(raw,);
    if (seedError) { return { ok: false, error: seedError, }; }
    return { ok: true, value: jsonStringifyOr(raw,), };
  }

  return {
    ok: false,
    error: jsonError({
      message: "autonomyConfig must be an object or JSON string",
      status: HttpStatus.BadRequest,
    },),
  };
}
