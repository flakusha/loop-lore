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

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

import { Elysia } from "elysia";
import type { Db } from "../db";
import type { Config } from "../config/schema";
import {
  jsonResponse,
  jsonNoContent,
  HttpStatus,
  parsePagination,
} from "./http-utils";
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

export function adminRoutes(opts: { database: Db; config: Config }): Elysia {
  const db = opts.database;

  return new Elysia({ name: "admin" })
    // ── User management ────────────────────────────────────
    .get("/api/admin/users", async ({ userRole, error, request }) => {
      if (userRole !== "admin") {
        return error(HttpStatus.Forbidden, { message: "Admin access required" });
      }

      const { page, pageSize } = parsePagination(new URL(request.url).searchParams);
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
    })
    .get("/api/admin/users/:id", async ({ params: p, userRole, error }) => {
      if (userRole !== "admin") {
        return error(HttpStatus.Forbidden, { message: "Admin access required" });
      }

      const { id } = p as { id: string };
      const user = await db
        .selectFrom("users")
        .select(["id", "username", "display_name", "role", "status", "birth_date", "settings", "created_at", "last_seen_at"])
        .where("id", "=", id)
        .executeTakeFirst();

      if (!user) {
        return error(HttpStatus.NotFound, { message: "User not found" });
      }
      return jsonResponse(user);
    })
    .patch("/api/admin/users/:id/role", async ({ params: p, body, userRole, error }) => {
      if (userRole !== "admin") {
        return error(HttpStatus.Forbidden, { message: "Admin access required" });
      }

      const { id } = p as { id: string };
      const b = (body || {}) as Record<string, unknown>;
      const role = b.role as string | undefined;
      if (!role || !["admin", "user", "viewer"].includes(role)) {
        return error(HttpStatus.BadRequest, { message: "Valid role required: admin, user, viewer" });
      }

      await db.updateTable("users").set({ role: role as any }).where("id", "=", id).execute();
      return jsonResponse({ ok: true });
    })
    .delete("/api/admin/users/:id", async ({ params: p, userRole, error }) => {
      if (userRole !== "admin") {
        return error(HttpStatus.Forbidden, { message: "Admin access required" });
      }

      const { id } = p as { id: string };
      await db.deleteFrom("users").where("id", "=", id).execute();
      return jsonNoContent();
    })

    // ── Stats ──────────────────────────────────────────────
    .get("/api/admin/stats", async ({ userRole, error }) => {
      if (userRole !== "admin") {
        return error(HttpStatus.Forbidden, { message: "Admin access required" });
      }

      const [userCount, chatCount, messageCount, characterCount, assetCount] = await Promise.all([
        db.selectFrom("users").select(db.fn.countAll<number>().as("n")).executeTakeFirst(),
        db.selectFrom("chats").select(db.fn.countAll<number>().as("n")).executeTakeFirst(),
        db.selectFrom("messages").select(db.fn.countAll<number>().as("n")).executeTakeFirst(),
        db.selectFrom("actors").select(db.fn.countAll<number>().as("n")).where("actor_type", "=", "character" as any).executeTakeFirst(),
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
    .get("/api/admin/providers", ({ userRole, error }) => {
      if (userRole !== "admin") {
        return error(HttpStatus.Forbidden, { message: "Admin access required" });
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
    .get("/api/admin/providers/:name/models", ({ params, error }) => {
      const providerName = (params as any).name as string;

      const health = getProviderHealth(providerName);
      if (!health) {
        return error(HttpStatus.NotFound, { message: "Provider not found" });
      }
      return jsonResponse({
        name: health.name,
        label: health.label,
        models: health.models,
        status: health.status,
      });
    })
    .post("/api/admin/providers/rescan", async ({ userRole, error }) => {
      if (userRole !== "admin") {
        return error(HttpStatus.Forbidden, { message: "Admin access required" });
      }

      const results = await scanAllProviders();
      return jsonResponse({
        providers: results.map((p) => providerToSummary(p)),
      });
    })

    // ── Model role overrides ───────────────────────────────
    .get("/api/admin/model-roles", async ({ userRole, error }) => {
      if (userRole !== "admin") {
        return error(HttpStatus.Forbidden, { message: "Admin access required" });
      }

      const resolved = await resolveAllModelRoles(opts.config, opts.database);
      const overrides = await getModelRoleOverrides(opts.database);

      return jsonResponse({ roles: resolved, overrides, validRoles: VALID_ROLES });
    })
    .put("/api/admin/model-roles/:role", async ({ params: p, body, userRole, error }) => {
      if (userRole !== "admin") {
        return error(HttpStatus.Forbidden, { message: "Admin access required" });
      }

      const role = (p as any).role as string;
      if (!VALID_ROLES.includes(role as ModelRole)) {
        return error(HttpStatus.BadRequest, {
          message: `Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(", ")}`,
        });
      }

      const bodyObj = (body || {}) as Record<string, unknown>;
      const provider = bodyObj.provider as string | undefined;
      const model = bodyObj.model as string | undefined;
      if (!provider || !model) {
        return error(HttpStatus.BadRequest, { message: "provider and model required" });
      }

      try {
        await setModelRoleOverride(role as ModelRole, provider, model, opts.database);
        return jsonResponse({ ok: true });
      } catch (e) {
        return error(HttpStatus.BadRequest, { message: (e as Error).message });
      }
    })
    .delete("/api/admin/model-roles/:role", async ({ params: p, userRole, error }) => {
      if (userRole !== "admin") {
        return error(HttpStatus.Forbidden, { message: "Admin access required" });
      }

      const role = (p as any).role as string;
      if (!VALID_ROLES.includes(role as ModelRole)) {
        return error(HttpStatus.BadRequest, {
          message: `Invalid role: "${role}". Must be one of: ${VALID_ROLES.join(", ")}`,
        });
      }

      await clearModelRoleOverride(role as ModelRole, opts.database);
      return jsonNoContent();
    });
}