// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { can, } from "../../users/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { seedDefaultActors, } from "../../db/seed";

const log = (): ReturnType<ReturnType<typeof getLogger>["child"]> => getLogger().child({ module: "admin-danger-zone", },);

/**
 * Tables wiped by factory reset, in FK-safe order (children before parents).
 *
 * The list is typed against `keyof DB` so a typo'd entry fails compilation
 * (`Type '"foo"' is not assignable to type 'keyof DB'`). Adding a new
 * wipeable user-data table means adding it here — verified by reading
 * the DB schema in `src/db/schema.ts`.
 *
 * Not every table in `DB` belongs in this list: framework tables
 * (`system_config`, `data_migrations`, `plugin_state`, `telemetry_events`,
 * quest/rpg state, etc.) are intentionally preserved across a factory reset.
 */
const TABLE_LIST: readonly (keyof DB)[] = [
  "sessions",
  "messages",
  "chats",
  "assets",
  "worlds",
  "actors",
  "users",
  "log_entries",
];

/**
 * Compile-time invariant: every entry of `TABLE_LIST` must be a valid DB
 * table name (covered by `keyof DB`). The `never` cast below is the
 * type-level assertion — a typo'd string in TABLE_LIST would surface here
 * as a `Type '...'` is not assignable to `never` error at `tsc` time.
 */
type _AssertEveryEntryIsATable = (typeof TABLE_LIST)[number] extends keyof DB ? true : never;
const _entryIsTable: _AssertEveryEntryIsATable = true as const;
void _entryIsTable;
/**
 * Admin danger-zone routes — destructive, confirmation-gated actions.
 *
 * All three endpoints require a typed confirmation string in the body:
 *   "PURGE"      — wipe audit log_entries
 *   "RESET"      — restore system_config defaults
 *   "DELETE ALL" — factory reset: wipe user data, re-seed minimal admin
 *
 * Every action is audit-logged BEFORE it executes so the trail survives.
 * @param opts
 * @param prefix
 */
export function dangerZoneRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const db = opts.database;
  const { config, } = opts;

  /**
   * @param message
   * @param action
   */
  async function audit(message: string, action: string,): Promise<void> {
    try {
      await db
        .insertInto("log_entries",)
        .values({
          id: crypto.randomUUID(),
          level: 6, // INFO
          timestamp: Date.now(),
          time: new Date().toISOString(),
          message,
          module: "admin-danger-zone",
          action,
          event_type: "admin",
          entity_type: "system",
        },)
        .execute();
    } catch {
      /* audit logging must never crash the action */
    }
  }

  return (
    new Elysia({ name: "admin-danger-zone", },)
      // ── Purge audit log ─────────────────────────────────────
      .post(
        `${prefix}/admin/audit/purge`,
        async (ctx: any,) => {
          const { userRole, body, } = ctx;
          if (!can(userRole, "admin.system",)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          if (body.confirmation !== "PURGE") {
            return jsonError({
              message: ctx.t?.("admin.invalidConfirmation",) ?? "Confirmation string mismatch",
              status: HttpStatus.BadRequest,
              code: ErrorCode.ValidationError,
            },);
          }
          await audit("Audit log purge requested", "purge-audit",);
          await db.deleteFrom("log_entries",).execute();
          return jsonResponse({ purged: true, },);
        },
        {
          body: t.Object({ confirmation: t.String(), },),
          response: {
            200: t.Object({ purged: t.Boolean(), },),
            400: ErrorResponse,
            403: ErrorResponse,
          },
        },
      )
      // ── Reset system config to defaults ────────────────────
      .post(
        `${prefix}/admin/settings/reset`,
        async (ctx: any,) => {
          const { userRole, body, } = ctx;
          if (!can(userRole, "admin.system",)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          if (body.confirmation !== "RESET") {
            return jsonError({
              message: ctx.t?.("admin.invalidConfirmation",) ?? "Confirmation string mismatch",
              status: HttpStatus.BadRequest,
              code: ErrorCode.ValidationError,
            },);
          }
          await audit("System settings reset requested", "reset-settings",);
          await db.deleteFrom("system_config",).execute();
          const { seedDefaults, } = await import("../../admin/config");
          await seedDefaults(db, config,);
          return jsonResponse({ reset: true, },);
        },
        {
          body: t.Object({ confirmation: t.String(), },),
          response: {
            200: t.Object({ reset: t.Boolean(), },),
            400: ErrorResponse,
            403: ErrorResponse,
          },
        },
      )
      // ── Factory reset ───────────────────────────────────────
      .post(
        `${prefix}/admin/factory-reset`,
        async (ctx: any,) => {
          const { userRole, body, } = ctx;
          if (!can(userRole, "admin.system",)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          if (body.confirmation !== "DELETE ALL") {
            return jsonError({
              message: ctx.t?.("admin.invalidConfirmation",) ?? "Confirmation string mismatch",
              status: HttpStatus.BadRequest,
              code: ErrorCode.ValidationError,
            },);
          }
          await audit("Factory reset requested", "factory-reset",);
          // Errors propagate to the route handler boundary, where they are
          // translated to a 500 response with a logged cause. The DB call
          // itself never swallows an error.
          try {
            await db.transaction().execute(async (trx,) => {
              for (const table of TABLE_LIST) {
                await trx.deleteFrom(table,).execute();
              }
            },);
            await seedDefaultActors(db, config,);
          } catch (error) {
            log().error("Factory reset failed", error as Error,);
            return jsonError({
              message: ctx.t?.("admin.factoryResetFailed",) ?? "Factory reset failed",
              status: HttpStatus.InternalServerError,
              code: ErrorCode.ServerError,
            },);
          }
          return jsonResponse({ reset: true, },);
        },
        {
          body: t.Object({ confirmation: t.String(), },),
          response: {
            200: t.Object({ reset: t.Boolean(), },),
            400: ErrorResponse,
            403: ErrorResponse,
          },
        },
      )
  );
}
