// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { EMPTY_AUTONOMY_OVERRIDE, } from "../../autonomy/config";
import { jsonStringifyOr, safeJsonParse, } from "../../utils/safe-json";
import { HttpStatus, jsonError, } from "../http-utils";

type AutonomyUpdateResult =
  | { ok: true; value: string | null | undefined }
  | { ok: false; error: Response };

/**
 * Normalise an `autonomyConfig` request field for the `worlds.autonomy_config`
 * TEXT column.
 *
 * `undefined` means "field absent" and yields `value: undefined` so the caller
 * leaves the column untouched. `null` / `""` clears the world layer: the
 * column is `NOT NULL DEFAULT '{}'` (migration 022) and the resolver reads
 * `{}` as "no override", so clearing writes `{}` rather than SQL NULL. A
 * string must be valid JSON - storing an unparseable blob would make the
 * tick resolver silently ignore the override.
 *
 * @param raw - the request field, if present
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
    return { ok: true, value: raw, };
  }
  if (typeof raw === "object") { return { ok: true, value: jsonStringifyOr(raw,), }; }
  return {
    ok: false,
    error: jsonError({
      message: "autonomyConfig must be an object or JSON string",
      status: HttpStatus.BadRequest,
    },),
  };
}
