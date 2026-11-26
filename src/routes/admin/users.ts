// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import type { Db, } from "../../db";
import type { UserRole, } from "../../db/enums-core/users";
import { redactCredentials, } from "../../integrations/secrets";
import { getLogger, } from "../../logger";
import { jsonParseOr, safeJsonStringify, uid, } from "../../utils";
import {
  ADMIN_ROLES,
  AdminRoleUpdateBody,
  ErrorResponse,
  PaginationQuery,
  SuccessResponse,
  UserIdParams,
} from "../../validation/schemas";
import { AdminPaginatedEnvelope, AdminUserRow, } from "../../validation/schemas/responses";
import {
  badRequestResponse,
  ErrorCode,
  HttpStatus,
  jsonError,
  jsonNoContent,
  jsonResponse,
  parsePagination,
  withPermissionAuth,
} from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * Whether deleting `id` or moving it to `nextRole` would leave zero admins.
 * Shared by admin delete, admin role patch and the v1 user delete route.
 * @param database - user database
 * @param id - target user id
 * @param nextRole - role after the change; undefined means deletion
 * @returns true when the mutation must be refused
 */
export async function wouldRemoveLastAdmin(
  database: Db,
  id: string,
  nextRole?: string,
): Promise<boolean> {
  const target = await database
    .selectFrom("users",).select("role",).where("id", "=", id,).executeTakeFirst();

  if (!target || target.role !== "admin" || nextRole === "admin") { return false; }

  const remaining = await database
    .selectFrom("users",)
    .select(database.fn.count("id",).as("count",),)
    .where("role", "=", "admin",)
    .where("id", "!=", id,)
    .executeTakeFirst();

  return !remaining || Number(remaining.count,) === 0;
}

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { admin: { users: { ...; }; }; }; } & { ...; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function usersRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const db = opts.database;

  return (
    new Elysia({ name: "admin-users", },)
      // ── User management ────────────────────────────────────
      .get(
        `${prefix}/admin/users`,
        async (ctx: any,) => {
          return withPermissionAuth(ctx, "admin.users", async () => {
            const url = new URL(ctx.request.url,);
            const { page, pageSize, } = parsePagination(url.searchParams,);
            const offset = (page - 1) * pageSize;
            const q = url.searchParams.get("q",);
            const roleFilter = url.searchParams.get("role",);
            const statusFilter = url.searchParams.get("status",);

            let countQuery = db.selectFrom("users",).select(db.fn.countAll<number>().as("total",),);
            let listQuery = db
              .selectFrom("users",)
              .select(["id", "username", "display_name", "role", "status", "created_at", "last_seen_at",],)
              .orderBy("created_at", "desc",)
              .limit(pageSize,)
              .offset(offset,);

            if (q) {
              const like = `%${q}%`;
              countQuery = countQuery.where((eb,) =>
                eb.or([eb("username", "like", like,), eb("display_name", "like", like,),],)
              );

              listQuery = listQuery.where((eb,) =>
                eb.or([eb("username", "like", like,), eb("display_name", "like", like,),],)
              );
            }

            if (roleFilter) {
              countQuery = countQuery.where("role", "=", roleFilter as any,);
              listQuery = listQuery.where("role", "=", roleFilter as any,);
            }

            if (statusFilter) {
              countQuery = countQuery.where("status", "=", statusFilter as any,);
              listQuery = listQuery.where("status", "=", statusFilter as any,);
            }

            const countResult = await countQuery.executeTakeFirst();
            const total = countResult?.total ?? 0;
            const users = await listQuery.execute();

            return jsonResponse({ data: users, total, page, pageSize, },);
          },);
        },
        {
          query: PaginationQuery,
          response: {
            200: AdminPaginatedEnvelope(AdminUserRow,),
            403: ErrorResponse,
          },
          detail: {
            summary: "List users",
            description: "List all users with search, role, and status filtering. Admin only.",
            tags: ["Admin",],
          },
        },
      )
      .get(
        `${prefix}/admin/users/:id`,
        async (ctx: any,) => {
          return withPermissionAuth(ctx, "admin.users", async () => {
            const { id, } = ctx.params as { id: string };
            const user = await db
              .selectFrom("users",)
              .select([
                "id",
                "username",
                "display_name",
                "role",
                "status",
                "birth_date",
                "settings",
                "created_at",
                "last_seen_at",
              ],)
              .where("id", "=", id,)
              .executeTakeFirst();

            if (!user) {
              return jsonError({
                message: ctx.t?.("admin.userNotFound",) ?? "User not found",
                status: HttpStatus.NotFound,
                code: ErrorCode.NotFound,
              },);
            }

            // BYO provider keys live in `settings` as plaintext; an admin
            // detail response must not echo them (RA-09). Redact the parsed
            // blob and re-serialize so the response shape stays unchanged.
            const settings = user.settings
              ? redactCredentials(jsonParseOr<Record<string, unknown>>(user.settings, {},),)
              : {};

            const serialized = safeJsonStringify(settings,);
            return jsonResponse({ ...user, settings: serialized.ok ? serialized.value : "{}", },);
          },);
        },
        {
          params: UserIdParams,
          response: {
            200: t.Any(),
            403: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Get user",
            description: "Get a user's full profile including settings and birth date. Admin only.",
            tags: ["Admin",],
          },
        },
      )
      .patch(
        `${prefix}/admin/users/:id/role`,
        async (ctx: any,) => {
          return withPermissionAuth(ctx, "admin.users", async (userId,) => {
            const { id, } = ctx.params as { id: string };
            const { role, } = ctx.body as { role: string };

            // Schema is a plain string (see AdminRoleUpdateBody); enforce the
            // role set here so an out-of-enum value is a 400, never a write.
            const isRole = (r: string,): r is UserRole => (ADMIN_ROLES as readonly string[]).includes(r,);
            if (!isRole(role,)) {
              return badRequestResponse(`role must be one of: ${ADMIN_ROLES.join(", ",)}`,);
            }

            // Capture the prior role for the audit row (TASK-032).
            const prior = await db.selectFrom("users",).select("role",).where("id", "=", id,).executeTakeFirst();

            if (await wouldRemoveLastAdmin(db, id, role,)) {
              return jsonError({
                message: ctx.t?.("admin.cannotDemoteLastAdmin",) ?? "Cannot demote the last admin account",
                status: HttpStatus.BadRequest,
                code: ErrorCode.BadRequest,
              },);
            }

            await db.updateTable("users",).set({ role, },).where("id", "=", id,).execute();

            // Audit event (event_type = "user.role_changed") so the admin
            // history shows who promoted/demoted whom. Errors here are
            // non-fatal — the role change has already committed.
            try {
              const meta = safeJsonStringify({ from: prior?.role ?? null, to: role, },);
              await db
                .insertInto("log_entries",)
                .values({
                  id: uid(),
                  level: 30, // INFO/WARN-equivalent
                  timestamp: Date.now() / 1000,
                  time: new Date().toISOString(),
                  message: `Role changed: user ${id} ${prior?.role ?? "unknown"} → ${role}`,
                  module: "admin-users",
                  user_id: userId,
                  event_type: "user.role_changed",
                  entity_type: "user",
                  entity_id: id,
                  action: "role_change",
                  meta: meta.ok ? meta.value : "{}",
                },)
                .execute();
            } catch {
              // Audit write failure must not roll back the role change.
              getLogger().child({ module: "admin-users", },).warn(`Role-change audit write failed for user ${id}`,);
            }

            return jsonResponse({ ok: true, },);
          },);
        },
        {
          body: AdminRoleUpdateBody,
          params: UserIdParams,
          response: { 200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
        },
      )
      .delete(
        `${prefix}/admin/users/:id`,
        async (ctx: any,) => {
          return withPermissionAuth(ctx, "admin.users", async (userId,) => {
            const { id, } = ctx.params as { id: string };

            if (id === userId) {
              return jsonError({
                message: ctx.t?.("admin.cannotDeleteSelf",) ?? "Cannot delete your own account",
                status: HttpStatus.BadRequest,
                code: ErrorCode.BadRequest,
              },);
            }

            const target = await db
              .selectFrom("users",)
              .select("role",)
              .where("id", "=", id,)
              .executeTakeFirst();

            if (!target) {
              return jsonError({
                message: ctx.t?.("admin.userNotFound",) ?? "User not found",
                status: HttpStatus.NotFound,
                code: ErrorCode.NotFound,
              },);
            }

            if (await wouldRemoveLastAdmin(db, id,)) {
              return jsonError({
                message: ctx.t?.("admin.cannotDeleteLastAdmin",) ?? "Cannot delete the last admin account",
                status: HttpStatus.BadRequest,
                code: ErrorCode.BadRequest,
              },);
            }

            await db.deleteFrom("users",).where("id", "=", id,).execute();
            return jsonNoContent();
          },);
        },
        {
          params: UserIdParams,
          response: { 204: t.Void(), 400: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
        },
      )
  );
}
