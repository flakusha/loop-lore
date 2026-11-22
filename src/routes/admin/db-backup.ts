// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { type Context, Elysia, t, } from "elysia";
import { randomUUID, } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ASSETS_DEFAULTS, } from "../../config/sections/assets";
import {
  createDbBackup,
  dbBackupDir,
  hasSqliteHeader,
  InvalidSnapshotError,
  listDbBackups,
  liveDbPath,
  resolveBackupPath,
  restoreDbBackup,
  validateSqliteSnapshot,
} from "../../db/backup-restore";
import { getSqliteDatabase, resetDatabaseSingleton, } from "../../db/index";
import { getLogger, } from "../../logger";
import {
  ADMIN_NAME_PATTERN,
  AdminDbBackupRestoreBody,
  ErrorResponse,
} from "../../validation/schemas";
import {
  ErrorCode,
  HttpStatus,
  jsonError,
  jsonResponse,
  withPermissionAuth,
} from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/** Auth fields injected by the global derive; kept out of Elysia's inferred ctx. */
type BackupAuthCtx = Context & {
  userId: string | null;
  userRole: string | null;
};
type BackupParamCtx = BackupAuthCtx & { params: { name: string } };

const BACKUP_NAME_RE = new RegExp(ADMIN_NAME_PATTERN,);
const tBackupName = t.String({ minLength: 1, maxLength: 64, pattern: ADMIN_NAME_PATTERN, },);
const tBackupParams = t.Object({ name: tBackupName, },);
const tBackupMeta = t.Object({ name: t.String(), sizeBytes: t.Number(), },);

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
  const dir = dbBackupDir();
  const log = (): ReturnType<ReturnType<typeof getLogger>["child"]> =>
    getLogger().child({ module: "admin-db-backup", },);

  return (
    new Elysia({ name: "admin-db-backup", },)
      .onError(({ code, },) => {
        if (code !== "VALIDATION") { return undefined; }
        return jsonError({
          message: "Invalid database restore payload",
          status: HttpStatus.BadRequest,
          code: ErrorCode.ValidationError,
        },);
      },)
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
              livePath: liveDbPath(opts.config.server,),
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
            const message = error instanceof InvalidSnapshotError
              ? "Restore failed: snapshot is not a valid SQLite database"
              : `Restore failed: ${(error as Error).message}`;

            return jsonError({
              message,
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
            },);
          }
        },);
      }, {
        body: AdminDbBackupRestoreBody,
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
      .get(`${prefix}/admin/db/backup/:name`, async (ctx,) => {
        const c = ctx as unknown as BackupParamCtx;
        return withPermissionAuth(c, "admin.system", () => {
          let resolved: string;
          try {
            resolved = resolveBackupPath(dir, c.params.name,);
          } catch {
            return jsonError({
              message: "Backup not found or invalid name",
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
            },);
          }

          log().info("Admin downloaded database backup", { userId: c.userId, name: c.params.name, },);
          return new Response(Bun.file(resolved,), {
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Disposition": `attachment; filename="${c.params.name}"`,
            },
          },);
        },);
      }, {
        params: tBackupParams,
        response: {
          400: ErrorResponse,
          403: ErrorResponse,
        },
        detail: {
          summary: "Download a database backup snapshot",
          description:
            "Streams a named SQLite snapshot from the server-derived backup directory. Only bare file names are accepted; path traversal is rejected.",
          tags: ["Admin", "Database backups",],
        },
      },)
      .post(`${prefix}/admin/db/backup/upload`, async (ctx,) => {
        const c = ctx as unknown as BackupAuthCtx;
        return withPermissionAuth(c, "admin.system", async () => {
          const maxBytes = opts.config.assets?.maxFileSize ?? ASSETS_DEFAULTS.maxFileSize;
          const contentType = c.request.headers.get("content-type",) ?? "";
          if (!contentType.includes("multipart/form-data",)) {
            return jsonError({ message: "Expected multipart/form-data", status: HttpStatus.BadRequest, },);
          }

          let form: FormData;
          try {
            form = await c.request.formData();
          } catch {
            return jsonError({ message: "Failed to parse upload", status: HttpStatus.BadRequest, },);
          }

          const file = form.get("file",);
          if (!file || !(file instanceof File)) {
            return jsonError({ message: "file field is required", status: HttpStatus.BadRequest, },);
          }

          if (file.size > maxBytes) {
            return jsonError({
              message: `Snapshot too large (max ${maxBytes} bytes)`,
              status: HttpStatus.UnprocessableEntity,
              code: ErrorCode.BadRequest,
            },);
          }

          const name = file.name;
          if (!BACKUP_NAME_RE.test(name,) || name.includes("..",) || !name.endsWith(".db",)) {
            return jsonError({ message: "Invalid snapshot name", status: HttpStatus.BadRequest, },);
          }

          const target = path.join(dir, name,);
          if (fs.existsSync(target,)) {
            return jsonError({ message: "Snapshot already exists", status: HttpStatus.BadRequest, },);
          }

          const tmp = path.join(dir, `.upload-${randomUUID()}.tmp`,);
          try {
            fs.mkdirSync(dir, { recursive: true, },);
            fs.writeFileSync(tmp, new Uint8Array(await file.arrayBuffer(),),);
            if (!hasSqliteHeader(tmp,)) {
              return jsonError({
                message: "Snapshot is not a SQLite database file",
                status: HttpStatus.BadRequest,
                code: ErrorCode.BadRequest,
              },);
            }

            validateSqliteSnapshot(tmp,);
            fs.renameSync(tmp, target,);
            const sizeBytes = fs.statSync(target,).size;
            log().info("Admin uploaded database backup", { userId: c.userId, name, sizeBytes, },);
            return jsonResponse({ backup: { name, sizeBytes, }, }, HttpStatus.Created,);
          } catch (error) {
            if (error instanceof InvalidSnapshotError) {
              return jsonError({
                message: "Snapshot is not a valid SQLite database",
                status: HttpStatus.BadRequest,
                code: ErrorCode.BadRequest,
              },);
            }

            log().error("Database snapshot upload failed", error as Error,);
            return jsonError({
              message: `Upload failed: ${(error as Error).message}`,
              status: HttpStatus.InternalServerError,
              code: ErrorCode.ServerError,
            },);
          } finally {
            if (fs.existsSync(tmp,)) {
              try {
                fs.unlinkSync(tmp,);
              } catch { /* best-effort temp cleanup */ }
            }
          }
        },);
      }, {
        parse: "none",
        response: {
          201: t.Object({ backup: tBackupMeta, },),
          400: ErrorResponse,
          403: ErrorResponse,
          422: ErrorResponse,
        },
        detail: {
          summary: "Upload a database backup snapshot",
          description:
            "Multipart upload of a SQLite snapshot (file field, .db name, byte cap from assets.maxFileSize). Validates the SQLite header and loop-lore schema before writing. Bare names only; traversal is rejected.",
          tags: ["Admin", "Database backups",],
        },
      },)
  );
}
