// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin read surface for the watchdog exec log (RSI first slice):
 *
 *   GET /api/admin/watchdog/events?limit=
 *
 * Newest first, default 50 rows, capped at 200. Guarded by `admin.system`
 * like the other admin listings. Read-only: the rows are written solely by
 * the supervisor's `onTransition` seam, so a mutator here would forge the
 * log.
 */
import { type Context, Elysia, t, } from "elysia";
import { can, } from "../../users/permissions";
import { forbiddenResponse, jsonResponse, requireUserId, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
type Ctx = Context & AuthContext;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const ListQuery = t.Object({
  limit: t.Optional(t.String({ maxLength: 8, },),),
},);

const NullableString = t.Union([t.String(), t.Null(),],);
const NullableInteger = t.Union([t.Integer(), t.Null(),],);

const WatchdogEventRow = t.Object({
  id: t.Integer(),
  event_kind: t.String(),
  decision_kind: t.String(),
  at_ms: t.Integer(),
  created_at: t.String(),
  reason: NullableString,
  misses: NullableInteger,
  crashes: NullableInteger,
},);

/**
 * @param opts - database/config threaded like every admin plugin
 * @param prefix - mount prefix (production: `/api/v1`)
 * @returns the mounted watchdog admin plugin
 */
export function watchdogRoutes(opts: AdminRouteOpts, prefix = "/api",): Elysia {
  const db = opts.database;

  return new Elysia({ name: "admin-watchdog", },).get(
    `${prefix}/admin/watchdog/events`,
    async (ctx,) => {
      const auth = ctx as unknown as Ctx;
      const adminId = requireUserId(auth,);
      if (typeof adminId !== "string") { return adminId; }
      if (!can(auth.userRole, "admin.system",)) { return forbiddenResponse(); }

      const parsed = Number.parseInt(ctx.query.limit ?? "", 10,);
      const limit = Number.isFinite(parsed,)
        ? Math.min(Math.max(parsed, 1,), MAX_LIMIT,)
        : DEFAULT_LIMIT;

      const data = await db.selectFrom("watchdog_events",)
        .selectAll()
        .orderBy("at_ms", "desc",)
        .orderBy("id", "desc",)
        .limit(limit,)
        .execute();

      return jsonResponse({ data, },);
    },
    {
      query: ListQuery,
      response: t.Object({ data: t.Array(WatchdogEventRow,), },),
      detail: {
        summary: "List recent watchdog events",
        description:
          "Read the watchdog state-machine exec log, newest first. `?limit` defaults to 50 and is capped at 200. Admin only; read-only.",
        tags: ["Admin", "Watchdog",],
      },
    },
  );
}
