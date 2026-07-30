/**
 * Admin Routes
 *
 * Admin-only endpoints:
 *   GET  /api/admin/users          — list all users
 *   GET  /api/admin/users/:id      — get user details
 *   PATCH /api/admin/users/:id/role  — update user role
 *   DELETE /api/admin/users/:id    — delete user (admin only)
 *   GET  /api/admin/stats          — system statistics
 *   GET  /api/admin/providers      — list providers with health status
 *   GET  /api/admin/providers/:name/models — list models for a provider
 *   POST /api/admin/providers/rescan — trigger provider re-scan
 *   GET  /api/admin/model-roles    — get current role assignments
 *   PUT  /api/admin/model-roles/:role — set role override
 *   DELETE /api/admin/model-roles/:role — clear role override
 */

import { Elysia, t, } from "elysia";
import { deleteConfig, getAllConfig, setConfig, } from "../admin/config";
import {
  clearModelRoleOverride,
  getModelRoleOverrides,
  type ModelRole,
  resolveAllModelRoles,
  setModelRoleOverride,
  VALID_ROLES,
} from "../admin/model-roles";
import { getHealthCache, getProviderHealth, providerToSummary, scanAllProviders, } from "../admin/provider-health";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { listProviders, } from "../generation/providers/registry";
import { isAdminRole, } from "../middleware/admin-gate";
import {
  AdminChatUpdateBody,
  AdminModelRoleOverrideBody,
  AdminRoleUpdateBody,
  AdminSystemConfigBody,
  AdminTemplateCreateBody,
  AdminTemplateUpdateBody,
  ChatIdParams,
  ErrorResponse,
  PaginationQuery,
  SuccessResponse,
  UserIdParams,
  WorldIdParams,
} from "../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonNoContent, jsonResponse, parsePagination, } from "./http-utils";

export function adminRoutes(opts: { database: Db; config: Config },): Elysia {
  const db = opts.database;

  return (
    new Elysia({ name: "admin", },)
      // ── User management ────────────────────────────────────
      .get(
        "/api/admin/users",
        async (ctx: any,) => {
          const { userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }

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
        },
        {
          query: PaginationQuery,
          response: {
            200: t.Object({ data: t.Array(t.Any(),), total: t.Number(), page: t.Number(), pageSize: t.Number(), },),
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
        "/api/admin/users/:id",
        async (ctx: any,) => {
          const { params: p, userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }

          const { id, } = p as { id: string };
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
          return jsonResponse(user,);
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
        "/api/admin/users/:id/role",
        async (ctx: any,) => {
          const { params: p, body, userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }

          const { id, } = p as { id: string };
          const { role, } = body as { role: "admin" | "user" | "viewer" };

          await db.updateTable("users",).set({ role, },).where("id", "=", id,).execute();
          return jsonResponse({ ok: true, },);
        },
        {
          body: AdminRoleUpdateBody,
          params: UserIdParams,
          response: { 200: SuccessResponse, 403: ErrorResponse, 404: ErrorResponse, },
        },
      )
      .delete(
        "/api/admin/users/:id",
        async (ctx: any,) => {
          const { params: p, userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }

          const { id, } = p as { id: string };
          await db.deleteFrom("users",).where("id", "=", id,).execute();
          return jsonNoContent();
        },
        { params: UserIdParams, response: { 204: t.Void(), 403: ErrorResponse, }, },
      )
      // ── Stats ──────────────────────────────────────────────
      .get("/api/admin/stats", async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const [userCount, chatCount, messageCount, characterCount, assetCount,] = await Promise.all([
          db.selectFrom("users",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
          db.selectFrom("chats",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
          db.selectFrom("messages",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
          db
            .selectFrom("actors",)
            .select(db.fn.countAll<number>().as("n",),)
            .where("actor_type", "=", "character" as any,)
            .executeTakeFirst(),
          db.selectFrom("assets",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
        ],);

        return jsonResponse({
          users: userCount?.n ?? 0,
          chats: chatCount?.n ?? 0,
          messages: messageCount?.n ?? 0,
          characters: characterCount?.n ?? 0,
          assets: assetCount?.n ?? 0,
        },);
      }, {
        response: {
          200: t.Object({
            users: t.Number(),
            chats: t.Number(),
            messages: t.Number(),
            characters: t.Number(),
            assets: t.Number(),
          },),
          403: ErrorResponse,
        },
      },)
      // ── Provider management ────────────────────────────────
      .get("/api/admin/providers", (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const health = getHealthCache();
        const providers = listProviders().map((p,) => {
          const status = health.find((h,) => h.name === p.name);
          return {
            name: p.name,
            label: p.capabilities.label,
            capabilities: p.capabilities,
            status: status?.status ?? "unknown",
            modelCount: status?.models.length ?? 0,
            latencyMs: status?.latencyMs,
            lastChecked: status?.lastChecked,
            error: status?.error,
          };
        },);

        return jsonResponse({ providers, },);
      }, {
        response: {
          200: t.Object({ providers: t.Array(t.Any(),), },),
          403: ErrorResponse,
        },
      },)
      .get("/api/admin/providers/:name/models", (ctx: any,) => {
        const { params, } = ctx;
        const providerName = params.name as string;

        const health = getProviderHealth(providerName,);
        if (!health) {
          return jsonError({
            message: ctx.t?.("admin.providerNotFound",) ?? "Provider not found",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }
        return jsonResponse({
          name: health.name,
          label: health.label,
          models: health.models,
          status: health.status,
        },);
      }, {
        response: {
          200: t.Object({ name: t.String(), label: t.String(), models: t.Array(t.Any(),), status: t.String(), },),
          404: ErrorResponse,
        },
      },)
      .post("/api/admin/providers/rescan", async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const results = await scanAllProviders();
        return jsonResponse({
          providers: results.map((p,) => providerToSummary(p,)),
        },);
      }, {
        response: {
          200: t.Object({ providers: t.Array(t.Any(),), },),
          403: ErrorResponse,
        },
      },)
      // ── Model role overrides ───────────────────────────────
      .get("/api/admin/model-roles", async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const resolved = await resolveAllModelRoles(opts.config, opts.database,);
        const overrides = await getModelRoleOverrides(opts.database,);

        return jsonResponse({ roles: resolved, overrides, validRoles: VALID_ROLES, },);
      }, {
        response: {
          200: t.Object({ roles: t.Array(t.Any(),), overrides: t.Array(t.Any(),), validRoles: t.Array(t.String(),), },),
          403: ErrorResponse,
        },
      },)
      .get("/api/admin/model-roles/:role", async (ctx: any,) => {
        const { params: p, userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const role = p.role as string;
        if (!(VALID_ROLES as readonly string[]).includes(role,)) {
          return jsonError({
            message: `Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(", ",)}`,
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          },);
        }

        const resolved = await resolveAllModelRoles(opts.config, opts.database,);
        const roleConfig = resolved.find((r,) => r.role === role) ?? null;
        return jsonResponse({ role, config: roleConfig, },);
      }, {
        response: {
          200: t.Object({ role: t.String(), config: t.Any(), },),
          400: ErrorResponse,
          403: ErrorResponse,
        },
      },)
      .put(
        "/api/admin/model-roles/:role",
        async (ctx: any,) => {
          const { params: p, body, userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }

          const role = p.role as string;
          if (!(VALID_ROLES as readonly string[]).includes(role,)) {
            return jsonError({
              message: `Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(", ",)}`,
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
            },);
          }

          const { provider, model, } = body as { provider: string; model: string };

          try {
            await setModelRoleOverride(role as ModelRole, provider, model, opts.database,);
            return jsonResponse({ ok: true, },);
          } catch (error) {
            return jsonError({
              message: (error as Error).message,
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
            },);
          }
        },
        {
          body: AdminModelRoleOverrideBody,
          response: { 200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, },
        },
      )
      .delete("/api/admin/model-roles/:role", async (ctx: any,) => {
        const { params: p, userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const role = p.role as string;
        if (!(VALID_ROLES as readonly string[]).includes(role,)) {
          return jsonError({
            message: `Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(", ",)}`,
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          },);
        }

        await clearModelRoleOverride(role as ModelRole, opts.database,);
        return jsonNoContent();
      }, {
        response: {
          204: t.Void(),
          400: ErrorResponse,
          403: ErrorResponse,
        },
      },)
      // ── SD.CPP status ──────────────────────────────────────
      .get("/api/admin/sd-status", async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const config = opts.config;
        const sdPort: number = (config as any).generation?.autoStart?.sdCpp?.port ?? 9010;
        let status: "running" | "stopped" | "unknown";
        let latencyMs: number | null = null;

        try {
          const start = Date.now();
          const res = await fetch(`http://127.0.0.1:${String(sdPort,)}/`, {
            signal: AbortSignal.timeout(5000,),
          },);
          latencyMs = Date.now() - start;
          status = res.ok ? "running" : "stopped";
        } catch {
          status = "stopped";
        }

        return jsonResponse({
          status,
          port: sdPort,
          latencyMs,
        },);
      }, {
        response: {
          200: t.Object({ status: t.String(), port: t.Number(), latencyMs: t.Optional(t.Number(),), },),
          403: ErrorResponse,
        },
      },)
      // ── System configuration ───────────────────────────────
      .get("/api/admin/system-config", async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const configs = await getAllConfig(opts.database,);
        return jsonResponse(configs,);
      }, {
        response: {
          200: t.Any(),
          403: ErrorResponse,
        },
      },)
      .patch(
        "/api/admin/system-config",
        async (ctx: any,) => {
          const { userRole, body, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { key, value, description, } = body as { key: string; value: string; description?: string };
          await setConfig(opts.database, key, value, description,);
          return jsonResponse({ ok: true, },);
        },
        { body: AdminSystemConfigBody, response: { 200: SuccessResponse, 403: ErrorResponse, }, },
      )
      .delete("/api/admin/system-config/:key", async (ctx: any,) => {
        const { params: p, userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const key = p.key as string;
        await deleteConfig(opts.database, key,);
        return jsonNoContent();
      }, {
        response: {
          204: t.Void(),
          403: ErrorResponse,
        },
      },)
      // ── World management ───────────────────────────────────
      .get(
        "/api/admin/worlds",
        async (ctx: any,) => {
          const { userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const url = new URL(ctx.request.url,);
          const { page, pageSize, } = parsePagination(url.searchParams,);
          const offset = (page - 1) * pageSize;
          const q = url.searchParams.get("q",);

          let countQuery = opts.database
            .selectFrom("worlds",)
            .select(opts.database.fn.countAll<number>().as("total",),);
          let listQuery = opts.database
            .selectFrom("worlds",)
            .select(["id", "name", "description", "owner_id", "created_at", "updated_at",],)
            .orderBy("created_at", "desc",)
            .limit(pageSize,)
            .offset(offset,);

          if (q) {
            const like = `%${q}%`;
            countQuery = countQuery.where("name", "like", like,);
            listQuery = listQuery.where("name", "like", like,);
          }

          const countResult = await countQuery.executeTakeFirst();
          const total = countResult?.total ?? 0;
          const worlds = await listQuery.execute();

          return jsonResponse({ data: worlds, total, page, pageSize, },);
        },
        {
          query: PaginationQuery,
          response: {
            200: t.Object({ data: t.Array(t.Any(),), total: t.Number(), page: t.Number(), pageSize: t.Number(), },),
            403: ErrorResponse,
          },
        },
      )
      .get(
        "/api/admin/worlds/:id",
        async (ctx: any,) => {
          const { params: p, userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { id, } = p as { id: string };
          const world = await opts.database
            .selectFrom("worlds",)
            .selectAll()
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!world) {
            return jsonError({
              message: ctx.t?.("admin.worldNotFound",) ?? "World not found",
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            },);
          }

          const locationCount = await opts.database
            .selectFrom("locations",)
            .select(opts.database.fn.countAll<number>().as("n",),)
            .where("world_id", "=", id,)
            .executeTakeFirst();

          return jsonResponse({
            ...world,
            locationCount: locationCount?.n ?? 0,
          },);
        },
        { params: WorldIdParams, response: { 200: t.Any(), 403: ErrorResponse, 404: ErrorResponse, }, },
      )
      .delete(
        "/api/admin/worlds/:id",
        async (ctx: any,) => {
          const { params: p, userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { id, } = p as { id: string };
          await opts.database.deleteFrom("worlds",).where("id", "=", id,).execute();
          return jsonNoContent();
        },
        { params: WorldIdParams, response: { 204: t.Void(), 403: ErrorResponse, }, },
      )
      // ── Chat management ────────────────────────────────────
      .get(
        "/api/admin/chats",
        async (ctx: any,) => {
          const { userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const url = new URL(ctx.request.url,);
          const { page, pageSize, } = parsePagination(url.searchParams,);
          const offset = (page - 1) * pageSize;
          const q = url.searchParams.get("q",);
          const typeFilter = url.searchParams.get("type",);

          let countQuery = opts.database
            .selectFrom("chats",)
            .select(opts.database.fn.countAll<number>().as("total",),);
          let listQuery = opts.database
            .selectFrom("chats",)
            .select(["id", "name", "type", "created_by", "world_id", "is_pinned", "created_at", "updated_at",],)
            .orderBy("created_at", "desc",)
            .limit(pageSize,)
            .offset(offset,);

          if (q) {
            const like = `%${q}%`;
            countQuery = countQuery.where("name", "like", like,);
            listQuery = listQuery.where("name", "like", like,);
          }
          if (typeFilter) {
            countQuery = countQuery.where("type", "=", typeFilter as any,);
            listQuery = listQuery.where("type", "=", typeFilter as any,);
          }

          const countResult = await countQuery.executeTakeFirst();
          const total = countResult?.total ?? 0;
          const chats = await listQuery.execute();

          return jsonResponse({ data: chats, total, page, pageSize, },);
        },
        {
          query: PaginationQuery,
          response: {
            200: t.Object({ data: t.Array(t.Any(),), total: t.Number(), page: t.Number(), pageSize: t.Number(), },),
            403: ErrorResponse,
          },
        },
      )
      .get(
        "/api/admin/chats/:id",
        async (ctx: any,) => {
          const { params: p, userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { id, } = p as { id: string };
          const chat = await opts.database
            .selectFrom("chats",)
            .selectAll()
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat) {
            return jsonError({
              message: ctx.t?.("admin.chatNotFound",) ?? "Chat not found",
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            },);
          }

          const msgCount = await opts.database
            .selectFrom("messages",)
            .select(opts.database.fn.countAll<number>().as("n",),)
            .where("chat_id", "=", id,)
            .executeTakeFirst();

          const participants = await opts.database
            .selectFrom("chat_participants",)
            .select(["actor_id", "role_in_chat", "joined_at",],)
            .where("chat_id", "=", id,)
            .execute();

          return jsonResponse({
            ...chat,
            messageCount: msgCount?.n ?? 0,
            participants,
          },);
        },
        { params: ChatIdParams, response: { 200: t.Any(), 403: ErrorResponse, 404: ErrorResponse, }, },
      )
      .patch(
        "/api/admin/chats/:id",
        async (ctx: any,) => {
          const { params: p, userRole, body, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { id, } = p as { id: string };
          const { is_pinned, world_id, } = body as { is_pinned?: string; world_id?: string | null };
          const updates: Record<string, unknown> = {};
          if (is_pinned !== undefined) { updates.is_pinned = is_pinned; }
          if (world_id !== undefined) { updates.world_id = world_id; }
          if (Object.keys(updates,).length === 0) {
            return jsonError({
              message: ctx.t?.("admin.noUpdatableFields",) ?? "No updatable fields",
              status: HttpStatus.BadRequest,
            },);
          }
          await opts.database
            .updateTable("chats",)
            .set(updates as any,)
            .where("id", "=", id,)
            .execute();
          return jsonResponse({ ok: true, },);
        },
        {
          body: AdminChatUpdateBody,
          params: ChatIdParams,
          response: { 200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, },
        },
      )
      .delete(
        "/api/admin/chats/:id",
        async (ctx: any,) => {
          const { params: p, userRole, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { id, } = p as { id: string };
          await opts.database.deleteFrom("chats",).where("id", "=", id,).execute();
          return jsonNoContent();
        },
        { params: ChatIdParams, response: { 204: t.Void(), 403: ErrorResponse, }, },
      )
      // ── Template management ─────────────────────────────────
      .get("/api/admin/templates", async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const row = await opts.database
          .selectFrom("system_config",)
          .select("value",)
          .where("key", "=", "sd.templates",)
          .executeTakeFirst();
        const profiles = row ? JSON.parse(row.value,) : {};
        return jsonResponse(profiles,);
      }, {
        response: {
          200: t.Any(),
          403: ErrorResponse,
        },
      },)
      .put(
        "/api/admin/templates/:id",
        async (ctx: any,) => {
          const { params: p, userRole, body, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const { id, } = p as { id: string };
          const update = body as Record<string, unknown>;
          const row = await opts.database
            .selectFrom("system_config",)
            .select("value",)
            .where("key", "=", "sd.templates",)
            .executeTakeFirst();
          const profiles: Record<string, unknown> = row ? JSON.parse(row.value,) : {};
          if (!profiles[id]) {
            return jsonError({
              message: ctx.t?.("admin.templateNotFound",) ?? "Template not found",
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            },);
          }
          profiles[id] = { ...profiles[id], ...update, id, };
          await opts.database
            .insertInto("system_config",)
            .values({
              key: "sd.templates",
              value: JSON.stringify(profiles,),
              description: "SD image model prompt templates",
            },)
            .onConflict((oc,) =>
              oc.column("key",).doUpdateSet({
                value: JSON.stringify(profiles,),
                updated_at: new Date().toISOString(),
              },)
            )
            .execute();
          return jsonResponse(profiles[id],);
        },
        { body: AdminTemplateUpdateBody, response: { 200: t.Any(), 403: ErrorResponse, 404: ErrorResponse, }, },
      )
      .post(
        "/api/admin/templates",
        async (ctx: any,) => {
          const { userRole, body, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const profile = body as Record<string, unknown>;
          const id = profile.id as string;
          const row = await opts.database
            .selectFrom("system_config",)
            .select("value",)
            .where("key", "=", "sd.templates",)
            .executeTakeFirst();
          const profiles: Record<string, unknown> = row ? JSON.parse(row.value,) : {};
          if (profiles[id]) {
            return jsonError({
              message: ctx.t?.("admin.templateAlreadyExists",) ?? "Template already exists",
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
            },);
          }
          profiles[id] = profile;
          await opts.database
            .insertInto("system_config",)
            .values({
              key: "sd.templates",
              value: JSON.stringify(profiles,),
              description: "SD image model prompt templates",
            },)
            .onConflict((oc,) =>
              oc.column("key",).doUpdateSet({
                value: JSON.stringify(profiles,),
                updated_at: new Date().toISOString(),
              },)
            )
            .execute();
          return jsonResponse(profile,);
        },
        { body: AdminTemplateCreateBody, response: { 200: t.Any(), 400: ErrorResponse, 403: ErrorResponse, }, },
      )
      .delete("/api/admin/templates/:id", async (ctx: any,) => {
        const { params: p, userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const { id, } = p as { id: string };
        const row = await opts.database
          .selectFrom("system_config",)
          .select("value",)
          .where("key", "=", "sd.templates",)
          .executeTakeFirst();
        const profiles: Record<string, unknown> = row ? JSON.parse(row.value,) : {};
        if (!profiles[id]) {
          return jsonError({
            message: ctx.t?.("admin.templateNotFound",) ?? "Template not found",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete profiles[id];
        await opts.database
          .insertInto("system_config",)
          .values({
            key: "sd.templates",
            value: JSON.stringify(profiles,),
            description: "SD image model prompt templates",
          },)
          .onConflict((oc,) =>
            oc.column("key",).doUpdateSet({ value: JSON.stringify(profiles,), updated_at: new Date().toISOString(), },)
          )
          .execute();
        return jsonNoContent();
      }, {
        response: {
          204: t.Void(),
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },)
      // ── Audit log ──────────────────────────────────────────
      .get(
        "/api/admin/audit",
        async (ctx: any,) => {
          const { userRole, request, } = ctx;
          if (!isAdminRole(userRole,)) {
            return jsonError({
              message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            },);
          }
          const url = new URL(request.url,);
          const { page, pageSize, } = parsePagination(url.searchParams,);
          const offset = (page - 1) * pageSize;
          const eventType = url.searchParams.get("event_type",);
          const userIdFilter = url.searchParams.get("user_id",);
          const entityType = url.searchParams.get("entity_type",);
          const q = url.searchParams.get("q",);

          let query = opts.database
            .selectFrom("log_entries",)
            .selectAll()
            .orderBy("created_at", "desc",)
            .limit(pageSize,)
            .offset(offset,);

          if (eventType) {
            query = query.where("event_type", "=", eventType,);
          }
          if (userIdFilter) {
            query = query.where("user_id", "=", userIdFilter,);
          }
          if (entityType) {
            query = query.where("entity_type", "=", entityType,);
          }
          if (q) {
            const like = `%${q}%`;
            query = query.where("message", "like", like,);
          }

          const entries = await query.execute();

          let countQuery = opts.database
            .selectFrom("log_entries",)
            .select(opts.database.fn.countAll<number>().as("total",),);
          if (eventType) {
            countQuery = countQuery.where("event_type", "=", eventType,);
          }
          if (userIdFilter) {
            countQuery = countQuery.where("user_id", "=", userIdFilter,);
          }
          if (entityType) {
            countQuery = countQuery.where("entity_type", "=", entityType,);
          }
          if (q) {
            const like = `%${q}%`;
            countQuery = countQuery.where("message", "like", like,);
          }
          const countResult = await countQuery.executeTakeFirst();
          const total = countResult?.total ?? 0;

          return jsonResponse({ data: entries, total, page, pageSize, },);
        },
        {
          query: PaginationQuery,
          response: {
            200: t.Object({ data: t.Array(t.Any(),), total: t.Number(), page: t.Number(), pageSize: t.Number(), },),
            403: ErrorResponse,
          },
        },
      )
      .get("/api/admin/audit/:id", async (ctx: any,) => {
        const { params: p, userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }
        const { id, } = p as { id: string };
        const entry = await opts.database
          .selectFrom("log_entries",)
          .selectAll()
          .where("id", "=", id,)
          .executeTakeFirst();
        if (!entry) {
          return jsonError({
            message: ctx.t?.("admin.logEntryNotFound",) ?? "Log entry not found",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }
        return jsonResponse(entry,);
      }, {
        response: {
          200: t.Any(),
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },)
      // ── Manual key rotation trigger ─────────────────────────
      .post("/api/admin/rotate-expired-keys", async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const { runAutoRotation, } = await import("../crypto/key-rotation");
        const rotationDays = opts.config.encryption.keyRotationDays ?? 0;

        if (rotationDays <= 0) {
          return jsonError({
            message: ctx.t?.("admin.autoRotationDisabled",) ??
              "Auto-rotation is disabled (keyRotationDays = 0)",
            status: HttpStatus.BadRequest,
          },);
        }

        const result = await runAutoRotation(opts.database, rotationDays,);
        return jsonResponse(result,);
      }, {
        response: {
          200: t.Any(),
          400: ErrorResponse,
          403: ErrorResponse,
        },
      },) as unknown as Elysia
  );
}
