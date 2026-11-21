// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin recovery surface for the runtime integrity watchdog:
 *
 *   GET  /api/admin/integrity/status  — current verdict + safe-mode state
 *   POST /api/admin/integrity/recover — acknowledge recovery, re-check, clear
 *                                       safe mode only when integrity is ok
 *
 * Both are guarded by `admin.system`. The POST re-runs the same bounded check
 * as the startup gate; it never clears safe mode on a failing verdict.
 */
import { type Context, Elysia, t, } from "elysia";
import { getSqliteDatabase, } from "../../db/index";
import { createSqliteIntegrityChecker, } from "../../integrity/sqlite-check";
import { clearSafeMode, getIntegrityState, recordVerdict, } from "../../integrity/state";
import { can, } from "../../users/permissions";
import { toDate, } from "../../utils/date";
import { forbiddenResponse, HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
type Ctx = Context & AuthContext;

/**
 * @param opts - database/config threaded like every admin plugin
 * @param prefix - mount prefix (production: `/api/v1`)
 * @returns the mounted integrity admin plugin
 */
export function integrityRoutes(
  _opts: AdminRouteOpts,
  prefix = "/api",
): Elysia {
  return new Elysia({ name: "admin-integrity", },)
    .get(`${prefix}/admin/integrity/status`, (ctx,) => {
      const auth = ctx as unknown as Ctx;
      const adminId = requireUserId(auth,);
      if (typeof adminId !== "string") { return adminId; }
      if (!can(auth.userRole, "admin.system",)) { return forbiddenResponse(); }
      const state = getIntegrityState();
      return jsonResponse({
        verdict: state.verdict,
        detail: state.detail,
        checkedAt: state.checkedAtMs === null ? null : toDate(state.checkedAtMs,).toISOString(),
        uncleanShutdown: state.uncleanShutdown,
        safeMode: state.safeMode,
        safeModeReason: state.safeModeReason,
      },);
    }, {
      detail: { summary: "Integrity status", tags: ["Admin", "Integrity",], },
    },)
    .post(`${prefix}/admin/integrity/recover`, (ctx,) => {
      const auth = ctx as unknown as Ctx;
      const adminId = requireUserId(auth,);
      if (typeof adminId !== "string") { return adminId; }
      if (!can(auth.userRole, "admin.system",)) { return forbiddenResponse(); }

      const sqlite = getSqliteDatabase();
      if (!sqlite) {
        return jsonError({
          message: "Cannot recover: no database handle",
          status: HttpStatus.ServiceUnavailable,
        },);
      }

      const result = createSqliteIntegrityChecker(sqlite,)();
      recordVerdict({ verdict: result.verdict, detail: result.detail, },);
      if (result.verdict === "fail") {
        return jsonError({
          message: `Integrity still failing; safe mode retained: ${result.detail}`,
          status: HttpStatus.Conflict,
        },);
      }

      clearSafeMode();
      return jsonResponse({ verdict: result.verdict, safeMode: false, },);
    }, {
      body: t.Object({ acknowledged: t.Literal(true,), },),
      detail: { summary: "Acknowledge integrity recovery", tags: ["Admin", "Integrity",], },
    },);
}
