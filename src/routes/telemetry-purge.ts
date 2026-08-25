// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "./http-utils";
import { can, } from "../users/permissions";
import { jsonStringifyOr, } from "../utils/safe-json";

/**
 * BUG-telemetry-purge-unbounded-days — delete telemetry events older than
 * the given retention window. Clamps `days` to `[1, 365]` and requires a
 * confirmation token (`?confirm=PURGE`) before destructive execution.
 *
 * Emits a `log_entries` audit row and a structured logger warning so the
 * action is traceable from the admin audit log.
 */
export async function purgeTelemetryEvents(
  database: Kysely<DB>,
  ctx: any,
): Promise<Response> {
  if (!can(ctx.userRole, "admin.system",)) {
    return jsonError({
      message: ctx.t?.("errors.forbidden",) ?? "Forbidden",
      status: HttpStatus.Forbidden,
      code: ErrorCode.Forbidden,
    },);
  }

  const rawDays = ctx.query?.days;
  const retentionDays = Number(rawDays,);
  if (
    rawDays === undefined ||
    !Number.isFinite(retentionDays,) ||
    retentionDays < 1 ||
    retentionDays > 365 ||
    !Number.isInteger(retentionDays,)
  ) {
    return jsonError({
      message: "days must be an integer in [1, 365]",
      status: HttpStatus.BadRequest,
      code: ErrorCode.BadRequest,
    },);
  }

  const confirm = ctx.query?.confirm ?? ctx.body?.confirm;
  if (confirm !== "PURGE") {
    return jsonError({
      message: "missing or invalid confirmation token (expected ?confirm=PURGE)",
      status: HttpStatus.BadRequest,
      code: ErrorCode.BadRequest,
    },);
  }

  const cutoff = new Date(Date.now() - retentionDays * 86_400_000,).toISOString();
  const result = await database
    .deleteFrom("telemetry_events",)
    .where("created_at", "<", cutoff,)
    .execute();
  const count = Number(result[0]?.numDeletedRows ?? 0n,);

  // Audit row — captured BEFORE the response so the action is traceable.
  await database.insertInto("log_entries",).values({
    id: crypto.randomUUID(),
    level: 2, // warn
    timestamp: Date.now(),
    time: new Date().toISOString(),
    message: "telemetry.purge",
    module: "telemetry",
    event_type: "admin",
    action: "telemetry-purge",
    user_id: typeof ctx.userId === "string" ? ctx.userId : null,
    session_id: null,
    request_id: null,
    meta: jsonStringifyOr({ retentionDays, count, cutoff, },),
    entity_type: "telemetry_events",
    entity_id: null,
    created_at: new Date().toISOString(),
  },).execute();

  getLogger().child({ module: "telemetry", },).warn("Purged old telemetry events", {
    retentionDays,
    cutoff,
    count,
  },);

  return jsonResponse({ ok: true, purged: true, count, },);
}