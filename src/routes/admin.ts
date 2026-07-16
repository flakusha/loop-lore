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

import { Elysia } from "elysia";
import type { Db } from "../db";
import type { Config } from "../config/schema";
import { jsonResponse, jsonError, jsonNoContent, HttpStatus, ErrorCode, parsePagination } from "./http-utils";
import {
  AdminRoleUpdateBody,
  AdminSystemConfigBody,
  AdminModelRoleOverrideBody,
  AdminChatUpdateBody,
  UserIdParams,
  WorldIdParams,
  ChatIdParams,
  PaginationQuery,
} from "../validation/schemas";
import {
  scanAllProviders,
  getHealthCache,
  getProviderHealth,
  providerToSummary,
} from "../admin/provider-health";
import { listProviders } from "../generation/providers/registry";
import {
  VALID_ROLES,
  resolveAllModelRoles,
  setModelRoleOverride,
  clearModelRoleOverride,
  getModelRoleOverrides,
  type ModelRole,
} from "../admin/model-roles";
import { getAllConfig, setConfig, deleteConfig } from "../admin/config";

export function adminRoutes(opts: { database: Db; config: Config }): Elysia {
  const db = opts.database;

  return (
    new Elysia({ name: "admin" })
      // ── User management ────────────────────────────────────
      .get(
        "/api/admin/users",
        async (ctx: any) => {
          const { userRole, error, query } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }

          const { page, pageSize } = query as { page: number; pageSize: number };
          const offset = (page - 1) * pageSize;

          const countResult = await db
            .selectFrom("users")
            .select(db.fn.countAll<number>().as("total"))
            .executeTakeFirst();
          const total = countResult?.total ?? 0;

          const users = await db
            .selectFrom("users")
            .select(["id", "username", "display_name", "role", "status", "created_at", "last_seen_at"])
            .orderBy("created_at", "desc")
            .limit(pageSize)
            .offset(offset)
            .execute();

          return jsonResponse({ data: users, total, page, pageSize });
        },
        { query: PaginationQuery },
      )
      .get(
        "/api/admin/users/:id",
        async (ctx: any) => {
          const { params: p, userRole, error } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }

          const { id } = p as { id: string };
          const user = await db
            .selectFrom("users")
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
            ])
            .where("id", "=", id)
            .executeTakeFirst();

          if (!user) {
            return jsonError({
              message: "User not found",
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            });
          }
          return jsonResponse(user);
        },
        { params: UserIdParams },
      )
      .patch(
        "/api/admin/users/:id/role",
        async (ctx: any) => {
          const { params: p, body, userRole, error } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }

          const { id } = p as { id: string };
          const { role } = body as { role: "admin" | "user" | "viewer" };

          await db.updateTable("users").set({ role }).where("id", "=", id).execute();
          return jsonResponse({ ok: true });
        },
        { body: AdminRoleUpdateBody, params: UserIdParams },
      )
      .delete(
        "/api/admin/users/:id",
        async (ctx: any) => {
          const { params: p, userRole, error } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }

          const { id } = p as { id: string };
          await db.deleteFrom("users").where("id", "=", id).execute();
          return jsonNoContent();
        },
        { params: UserIdParams },
      )

      // ── Stats ──────────────────────────────────────────────
      .get("/api/admin/stats", async (ctx: any) => {
        const { userRole, error } = ctx;
        if (userRole !== "admin") {
          return jsonError({
            message: "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          });
        }

        const [userCount, chatCount, messageCount, characterCount, assetCount] = await Promise.all([
          db.selectFrom("users").select(db.fn.countAll<number>().as("n")).executeTakeFirst(),
          db.selectFrom("chats").select(db.fn.countAll<number>().as("n")).executeTakeFirst(),
          db.selectFrom("messages").select(db.fn.countAll<number>().as("n")).executeTakeFirst(),
          db
            .selectFrom("actors")
            .select(db.fn.countAll<number>().as("n"))
            .where("actor_type", "=", "character" as any)
            .executeTakeFirst(),
          db.selectFrom("assets").select(db.fn.countAll<number>().as("n")).executeTakeFirst(),
        ]);

        return jsonResponse({
          users: userCount?.n ?? 0,
          chats: chatCount?.n ?? 0,
          messages: messageCount?.n ?? 0,
          characters: characterCount?.n ?? 0,
          assets: assetCount?.n ?? 0,
        });
      })

      // ── Provider management ────────────────────────────────
      .get("/api/admin/providers", (ctx: any) => {
        const { userRole, error } = ctx;
        if (userRole !== "admin") {
          return jsonError({
            message: "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          });
        }

        const health = getHealthCache();
        const providers = listProviders().map((p) => {
          const status = health.find((h) => h.name === p.name);
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
        });

        return jsonResponse({ providers });
      })
      .get("/api/admin/providers/:name/models", (ctx: any) => {
        const { params, error } = ctx;
        const providerName = (params as any).name as string;

        const health = getProviderHealth(providerName);
        if (!health) {
          return jsonError({
            message: "Provider not found",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          });
        }
        return jsonResponse({
          name: health.name,
          label: health.label,
          models: health.models,
          status: health.status,
        });
      })
      .post("/api/admin/providers/rescan", async (ctx: any) => {
        const { userRole, error } = ctx;
        if (userRole !== "admin") {
          return jsonError({
            message: "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          });
        }

        const results = await scanAllProviders();
        return jsonResponse({
          providers: results.map((p) => providerToSummary(p)),
        });
      })

      // ── Model role overrides ───────────────────────────────
      .get("/api/admin/model-roles", async (ctx: any) => {
        const { userRole, error } = ctx;
        if (userRole !== "admin") {
          return jsonError({
            message: "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          });
        }

        const resolved = await resolveAllModelRoles(opts.config, opts.database);
        const overrides = await getModelRoleOverrides(opts.database);

        return jsonResponse({ roles: resolved, overrides, validRoles: VALID_ROLES });
      })
      .put(
        "/api/admin/model-roles/:role",
        async (ctx: any) => {
          const { params: p, body, userRole, error } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }

          const role = (p as any).role as string;
          if (!VALID_ROLES.includes(role as ModelRole)) {
            return jsonError({
              message: `Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(", ")}`,
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
            });
          }

          const { provider, model } = body as { provider: string; model: string };

          try {
            await setModelRoleOverride(role as ModelRole, provider, model, opts.database);
            return jsonResponse({ ok: true });
          } catch (e) {
            return jsonError({
              message: (e as Error).message,
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
            });
          }
        },
        { body: AdminModelRoleOverrideBody },
      )
      .delete("/api/admin/model-roles/:role", async (ctx: any) => {
        const { params: p, userRole, error } = ctx;
        if (userRole !== "admin") {
          return jsonError({
            message: "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          });
        }

        const role = (p as any).role as string;
        if (!VALID_ROLES.includes(role as ModelRole)) {
          return jsonError({
            message: `Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(", ")}`,
            status: HttpStatus.BadRequest,
            code: ErrorCode.BadRequest,
          });
        }

        await clearModelRoleOverride(role as ModelRole, opts.database);
        return jsonNoContent();
      })

      // ── System configuration ───────────────────────────────
      .get("/api/admin/system-config", async (ctx: any) => {
        const { userRole, error } = ctx;
        if (userRole !== "admin") {
          return jsonError({
            message: "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          });
        }
        const configs = await getAllConfig(opts.database);
        return jsonResponse(configs);
      })
      .patch(
        "/api/admin/system-config",
        async (ctx: any) => {
          const { userRole, error, body } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }
          const { key, value, description } = body as { key: string; value: string; description?: string };
          await setConfig(opts.database, key, value, description);
          return jsonResponse({ ok: true });
        },
        { body: AdminSystemConfigBody },
      )
      .delete("/api/admin/system-config/:key", async (ctx: any) => {
        const { params: p, userRole, error } = ctx;
        if (userRole !== "admin") {
          return jsonError({
            message: "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          });
        }
        const key = (p as any).key as string;
        await deleteConfig(opts.database, key);
        return jsonNoContent();
      })

      // ── World management ───────────────────────────────────
      .get(
        "/api/admin/worlds",
        async (ctx: any) => {
          const { userRole, error, query } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }
          const { page, pageSize } = query as { page: number; pageSize: number };
          const offset = (page - 1) * pageSize;

          const countResult = await opts.database
            .selectFrom("worlds")
            .select(opts.database.fn.countAll<number>().as("total"))
            .executeTakeFirst();
          const total = countResult?.total ?? 0;

          const worlds = await opts.database
            .selectFrom("worlds")
            .select(["id", "name", "description", "owner_id", "created_at", "updated_at"])
            .orderBy("created_at", "desc")
            .limit(pageSize)
            .offset(offset)
            .execute();

          return jsonResponse({ data: worlds, total, page, pageSize });
        },
        { query: PaginationQuery },
      )
      .get(
        "/api/admin/worlds/:id",
        async (ctx: any) => {
          const { params: p, userRole, error } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }
          const { id } = p as { id: string };
          const world = await opts.database
            .selectFrom("worlds")
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();
          if (!world) {
            return jsonError({
              message: "World not found",
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            });
          }

          const locationCount = await opts.database
            .selectFrom("locations")
            .select(opts.database.fn.countAll<number>().as("n"))
            .where("world_id", "=", id)
            .executeTakeFirst();

          return jsonResponse({
            ...world,
            locationCount: locationCount?.n ?? 0,
          });
        },
        { params: WorldIdParams },
      )
      .delete(
        "/api/admin/worlds/:id",
        async (ctx: any) => {
          const { params: p, userRole, error } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }
          const { id } = p as { id: string };
          await opts.database.deleteFrom("worlds").where("id", "=", id).execute();
          return jsonNoContent();
        },
        { params: WorldIdParams },
      )

      // ── Chat management ────────────────────────────────────
      .get(
        "/api/admin/chats",
        async (ctx: any) => {
          const { userRole, error, query } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }
          const { page, pageSize } = query as { page: number; pageSize: number };
          const offset = (page - 1) * pageSize;

          const countResult = await opts.database
            .selectFrom("chats")
            .select(opts.database.fn.countAll<number>().as("total"))
            .executeTakeFirst();
          const total = countResult?.total ?? 0;

          const chats = await opts.database
            .selectFrom("chats")
            .select(["id", "name", "type", "created_by", "world_id", "is_pinned", "created_at", "updated_at"])
            .orderBy("created_at", "desc")
            .limit(pageSize)
            .offset(offset)
            .execute();

          return jsonResponse({ data: chats, total, page, pageSize });
        },
        { query: PaginationQuery },
      )
      .get(
        "/api/admin/chats/:id",
        async (ctx: any) => {
          const { params: p, userRole, error } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }
          const { id } = p as { id: string };
          const chat = await opts.database
            .selectFrom("chats")
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();
          if (!chat) {
            return jsonError({
              message: "Chat not found",
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            });
          }

          const msgCount = await opts.database
            .selectFrom("messages")
            .select(opts.database.fn.countAll<number>().as("n"))
            .where("chat_id", "=", id)
            .executeTakeFirst();

          const participants = await opts.database
            .selectFrom("chat_participants")
            .select(["actor_id", "role", "joined_at"])
            .where("chat_id", "=", id)
            .execute();

          return jsonResponse({
            ...chat,
            messageCount: msgCount?.n ?? 0,
            participants,
          });
        },
        { params: ChatIdParams },
      )
      .patch(
        "/api/admin/chats/:id",
        async (ctx: any) => {
          const { params: p, userRole, error, body } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }
          const { id } = p as { id: string };
          const { is_pinned, world_id } = body as { is_pinned?: string; world_id?: string | null };
          const updates: Record<string, unknown> = {};
          if (is_pinned !== undefined) updates.is_pinned = is_pinned;
          if (world_id !== undefined) updates.world_id = world_id;
          if (Object.keys(updates).length === 0) {
            return jsonError({ message: "No updatable fields", status: HttpStatus.BadRequest });
          }
          await opts.database
            .updateTable("chats")
            .set(updates as any)
            .where("id", "=", id)
            .execute();
          return jsonResponse({ ok: true });
        },
        { body: AdminChatUpdateBody, params: ChatIdParams },
      )
      .delete(
        "/api/admin/chats/:id",
        async (ctx: any) => {
          const { params: p, userRole, error } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }
          const { id } = p as { id: string };
          await opts.database.deleteFrom("chats").where("id", "=", id).execute();
          return jsonNoContent();
        },
        { params: ChatIdParams },
      )

      // ── Audit log ──────────────────────────────────────────
      .get(
        "/api/admin/audit",
        async (ctx: any) => {
          const { userRole, error, request } = ctx;
          if (userRole !== "admin") {
            return jsonError({
              message: "Admin access required",
              status: HttpStatus.Forbidden,
              code: ErrorCode.Forbidden,
            });
          }
          const url = new URL(request.url);
          const { page, pageSize } = parsePagination(url.searchParams);
          const offset = (page - 1) * pageSize;
          const eventType = url.searchParams.get("event_type");
          const userIdFilter = url.searchParams.get("user_id");
          const entityType = url.searchParams.get("entity_type");

          let query = opts.database
            .selectFrom("log_entries")
            .selectAll()
            .orderBy("created_at", "desc")
            .limit(pageSize)
            .offset(offset);

          if (eventType) {
            query = query.where("event_type", "=", eventType);
          }
          if (userIdFilter) {
            query = query.where("user_id", "=", userIdFilter);
          }
          if (entityType) {
            query = query.where("entity_type", "=", entityType);
          }

          const entries = await query.execute();

          const countResult = await opts.database
            .selectFrom("log_entries")
            .select(opts.database.fn.countAll<number>().as("total"))
            .executeTakeFirst();
          const total = countResult?.total ?? 0;

          return jsonResponse({ data: entries, total, page, pageSize });
        },
        { query: PaginationQuery },
      )
      .get("/api/admin/audit/:id", async (ctx: any) => {
        const { params: p, userRole, error } = ctx;
        if (userRole !== "admin") {
          return jsonError({
            message: "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          });
        }
        const { id } = p as { id: string };
        const entry = await opts.database
          .selectFrom("log_entries")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirst();
        if (!entry) {
          return jsonError({
            message: "Log entry not found",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          });
        }
        return jsonResponse(entry);
      }) as unknown as Elysia
  );
}
