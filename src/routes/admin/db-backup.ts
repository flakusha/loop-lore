// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { Elysia, t, } from "elysia";
import {
  createDbBackup,
  dbBackupDir,
  listDbBackups,
  liveDbPath,
  resolveBackupPath,
  restoreDbBackup,
} from "../../db/backup-restore";
import { getSqliteDatabase, resetDatabaseSingleton, } from "../../db/index";
import { getLogger, } from "../../logger";
import { ErrorResponse, } from "../../validation/schemas";
import {
  ErrorCode,
  HttpStatus,
  jsonError,
  jsonResponse,
  withPermissionAuth,
} from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * Admin database backup/restore routes.
 *
 * GET  /api/admin/db/backup  — list snapshot files (name, size, mtime)
 * POST /api/admin/db/backup  — write a consistent snapshot via VACUUM INTO
 * POST /api/admin/db/restore — validate + restore a snapshot (restart required)
 *
 * Restore semantics: the live handles are closed and the snapshot atomically
 * replaces the database file; previously captured Kysely handles are dead
 * afterwards, so the response carries `restartRequired: true`. See
 * `restoreDbBackup` in src/db/backup-restore.ts for the documented decision.
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function dbBackupRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  void opts;
  const dir = dbBackupDir();
  const log = (): ReturnType<ReturnType<typeof getLogger>["child"]> =>
    getLogger().child({ module: "admin-db-backup", },);

  return (
    new Elysia({ name: "admin-db-backup", },)
      .get(`${prefix}/admin/db/backup`, async (ctx: any,) => {
        return withPermissionAuth(ctx, "admin.system", async () => {
          return jsonResponse({ backups: listDbBackups(dir,), dir, },);
        },);
      }, {
        response: {
          200: t.Object({
            backups: t.Array(t.Object({
              name: t.String(),
              sizeBytes: t.Number(),
              modifiedAt: t.String(),
            },),),
            dir: t.String(),
          },),
          403: ErrorResponse,
        },
      },)
      .post(`${prefix}/admin/db/backup`, async (ctx: any,) => {
        return withPermissionAuth(ctx, "admin.system", async () => {
          const sqlite = getSqliteDatabase();
          if (!sqlite) {
            return jsonError({
              message: "No database connection is available",
              status: HttpStatus.InternalServerError,
              code: ErrorCode.ServerError,
            },);
          }

          try {
            const backup = await createDbBackup({ sqlite, dir, },);
            log().info("Admin requested database backup", { userId: ctx.userId, name: backup.name, },);
            return jsonResponse({ backup: { name: backup.name, sizeBytes: backup.sizeBytes, }, }, HttpStatus.Created,);
          } catch (error) {
            log().error("Database backup failed", error as Error,);
            return jsonError({
              message: `Backup failed: ${(error as Error).message}`,
              status: HttpStatus.InternalServerError,
              code: ErrorCode.ServerError,
            },);
          }
        },);
      }, {
        response: {
          201: t.Object({ backup: t.Object({ name: t.String(), sizeBytes: t.Number(), },), },),
          403: ErrorResponse,
          500: ErrorResponse,
        },
      },)
      .post(`${prefix}/admin/db/restore`, async (ctx: any,) => {
        return withPermissionAuth(ctx, "admin.system", async () => {
          if (ctx.body.confirmation !== "RESTORE") {
            return jsonError({
              message: "Confirmation string mismatch",
              status: HttpStatus.BadRequest,
              code: ErrorCode.ValidationError,
            },);
          }

          const sqlite = getSqliteDatabase();
          if (!sqlite) {
            return jsonError({
              message: "No database connection is available",
              status: HttpStatus.InternalServerError,
              code: ErrorCode.ServerError,
            },);
          }

          try {
            const backupPath = resolveBackupPath(dir, ctx.body.name,);
            const result = await restoreDbBackup({
              backupPath,
              livePath: liveDbPath(),
              sqlite,
              dir,
              closeDb: resetDatabaseSingleton,
            },);

            log().warn("Database restored; restart required", {
              userId: ctx.userId,
              name: ctx.body.name,
              preRestoreBackup: result.preRestoreBackup,
            },);

            return jsonResponse({
              restored: true,
              restartRequired: true,
              preRestoreBackup: result.preRestoreBackup,
            },);
          } catch (error) {
            log().error("Database restore failed", error as Error,);
            return jsonError({
              message: `Restore failed: ${(error as Error).message}`,
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
            },);
          }
        },);
      }, {
        body: t.Object({ name: t.String(), confirmation: t.String(), },),
        response: {
          200: t.Object({
            restored: t.Boolean(),
            restartRequired: t.Boolean(),
            preRestoreBackup: t.String(),
          },),
          400: ErrorResponse,
          403: ErrorResponse,
        },
      },)
  );
}
