/**
 * User Routes
 *
 *   GET  /api/users/me       — current user profile
 *   PUT  /api/users/me       — update own profile
 *   GET  /api/users/:id      — get user by ID (admin or self)
 *   PUT  /api/users/:id      — update user (admin or self)
 *   DELETE /api/users/:id    — delete user (admin only)
 *   PUT  /api/users/:id/settings   — update user settings
 */

import { Elysia } from "elysia";
import type { Db } from "../db";
import type { Config } from "../config/schema";
import { safeJsonStringify, jsonParseOr } from "../utils";
import { UserProfileUpdateBody, UserIdParams } from "../validation/schemas";
import { unauthorized, forbidden, notFound } from "../validation/middleware";
import { jsonResponse, jsonError, jsonNoContent, HttpStatus } from "./http-utils";

export function usersRoutes(opts: { database: Db; config: Config }): Elysia {
  return new Elysia({ name: "users" })
    .get("/api/users/me", async (ctx) => {
      const userId = (ctx as any).userId as string | null;

      if (!userId) return unauthorized();

      const user = await opts.database
        .selectFrom("users")
        .select(["id", "username", "display_name", "role", "created_at", "last_seen_at"])
        .where("id", "=", userId)
        .executeTakeFirst();

      if (!user) return notFound("User not found");
      return jsonResponse(user);
    })
    .put(
      "/api/users/me",
      async (ctx) => {
        const userId = (ctx as any).userId as string | null;
        const body = (ctx as any).body as typeof UserProfileUpdateBody;

        if (!userId) return unauthorized();

        const updates: Record<string, unknown> = {};
        if (body.displayName != null) updates.display_name = body.displayName;
        // TODO: re-validate age gate when birthDate changes
        if (body.birthDate != null) updates.birth_date = body.birthDate;
        if (body.settings) {
          const settingsResult = safeJsonStringify(body.settings);
          if (!settingsResult.ok)
            return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest });
          updates.settings = settingsResult.value;
        }

        await opts.database.updateTable("users").set(updates).where("id", "=", userId).execute();

        return jsonResponse({ ok: true });
      },
      { body: UserProfileUpdateBody },
    )
    .get(
      "/api/users/:id",
      async (ctx) => {
        const userId = (ctx as any).userId as string | null;
        const userRole = (ctx as any).userRole as string | null;
        const targetId = (ctx as any).params.id as string;

        if (!userId) return unauthorized();

        // Non-admin can only view own profile via /api/users/me
        if (userRole !== "admin") {
          return forbidden();
        }

        const user = await opts.database
          .selectFrom("users")
          .select(["id", "username", "display_name", "role", "created_at", "last_seen_at"])
          .where("id", "=", targetId)
          .executeTakeFirst();

        if (!user) return notFound("User not found");
        return jsonResponse(user);
      },
      { params: UserIdParams },
    )
    .put(
      "/api/users/:id",
      async (ctx) => {
        const userId = (ctx as any).userId as string | null;
        const userRole = (ctx as any).userRole as string | null;
        const targetId = (ctx as any).params.id as string;
        const body = (ctx as any).body as typeof UserProfileUpdateBody;

        if (!userId) return unauthorized();

        // User can update own profile; admin can update any
        if (targetId !== userId && userRole !== "admin") {
          return forbidden();
        }

        const updates: Record<string, unknown> = {};
        if (body.displayName !== undefined) updates.display_name = body.displayName;
        if (body.settings) {
          const settingsResult = safeJsonStringify(body.settings);
          if (!settingsResult.ok)
            return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest });
          updates.settings = settingsResult.value;
        }

        // Check target user exists
        const targetUser = await opts.database
          .selectFrom("users")
          .select("id")
          .where("id", "=", targetId)
          .executeTakeFirst();
        if (!targetUser) return notFound("User not found");

        await opts.database.updateTable("users").set(updates).where("id", "=", targetId).execute();

        return jsonResponse({ ok: true });
      },
      { body: UserProfileUpdateBody, params: UserIdParams },
    )
    .put(
      "/api/users/:id/settings",
      async (ctx) => {
        const userId = (ctx as any).userId as string | null;
        const userRole = (ctx as any).userRole as string | null;
        const targetId = (ctx as any).params.id as string;
        const body = (ctx as any).body as Record<string, unknown>;

        if (!userId) return unauthorized();

        if (targetId !== userId && userRole !== "admin") {
          return forbidden();
        }

        const current = await opts.database
          .selectFrom("users")
          .select("settings")
          .where("id", "=", targetId)
          .executeTakeFirst();

        const currentSettings = current?.settings ? jsonParseOr(current.settings, {}) : {};
        const merged = { ...currentSettings, ...body };

        const mergedResult = safeJsonStringify(merged);
        if (!mergedResult.ok)
          return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest });

        await opts.database
          .updateTable("users")
          .set({ settings: mergedResult.value })
          .where("id", "=", targetId)
          .execute();

        return jsonResponse(merged);
      },
      { params: UserIdParams },
    )
    .delete(
      "/api/users/:id",
      async (ctx) => {
        const userRole = (ctx as any).userRole as string | null;
        const targetId = (ctx as any).params.id as string;

        if (userRole !== "admin") {
          return forbidden();
        }

        await opts.database.deleteFrom("users").where("id", "=", targetId).execute();

        return jsonNoContent();
      },
      { params: UserIdParams },
    ) as unknown as Elysia;
}
