// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { isAdminRole, } from "../../middleware/admin-gate";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * Admin danger-zone routes — destructive, confirmation-gated actions.
 *
 * All three endpoints require a typed confirmation string in the body:
 *   "PURGE"      — wipe audit log_entries
 *   "RESET"      — restore system_config defaults
 *   "DELETE ALL" — factory reset: wipe user data, re-seed minimal admin
 *
 * Every action is audit-logged BEFORE it executes so the trail survives.
 */
export function dangerZoneRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const db = opts.database;
  const { config, } = opts;

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
          if (!isAdminRole(userRole,)) {
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
          if (!isAdminRole(userRole,)) {
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
          if (!isAdminRole(userRole,)) {
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
          // Wipe user data in FK-safe order (children before parents).
          const tables = [
            "sessions",
            "messages",
            "chats",
            "assets",
            "worlds",
            "actors",
            "users",
            "log_entries",
          ] as const;
          for (const table of tables) {
            try {
              await db.deleteFrom(table as any,).execute();
            } catch {
              /* best-effort per table */
            }
          }
          const { seedDefaultActors, } = await import("../../db/seed");
          await seedDefaultActors(db, config,);
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
