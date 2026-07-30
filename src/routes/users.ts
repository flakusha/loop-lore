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

import { Elysia, } from "elysia";
import { validateAge, } from "../age-gate/service";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { jsonParseOr, safeJsonStringify, } from "../utils";
import { forbidden, notFound, } from "../validation/middleware";
import { UserIdParams, UserProfileUpdateBody, } from "../validation/schemas";
import { HttpStatus, jsonError, jsonNoContent, jsonResponse, requireUserId, } from "./http-utils";

export function usersRoutes(opts: { database: Db; config: Config },): Elysia {
  return new Elysia({ name: "users", },)
    .get(
      "/api/users/me",
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const user = await opts.database
          .selectFrom("users",)
          .select(["id", "username", "display_name", "role", "created_at", "last_seen_at",],)
          .where("id", "=", userId,)
          .executeTakeFirst();

        if (!user) { return notFound("User not found",); }
        return jsonResponse(user,);
      },
      {
        detail: {
          summary: "Get current user",
          description: "Get the authenticated user's profile.",
          tags: ["Users",],
        },
      },
    )
    .put(
      "/api/users/me",
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const body = (ctx as any).body as typeof UserProfileUpdateBody;

        const updates: Record<string, unknown> = {};
        if (body.displayName != null) { updates.display_name = body.displayName; }
        if (body.birthDate != null) {
          // Re-validate age gate when birthDate changes
          try {
            validateAge(body.birthDate, opts.config.ageGate.minimumAge,);
          } catch (error) {
            return jsonError({
              message: error instanceof Error ? error.message : "Invalid birth date",
              status: HttpStatus.BadRequest,
            },);
          }
          updates.birth_date = body.birthDate;
        }
        if (body.settings) {
          const settingsResult = safeJsonStringify(body.settings,);
          if (!settingsResult.ok) {
            return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest, },);
          }
          updates.settings = settingsResult.value;
        }

        await opts.database.updateTable("users",).set(updates,).where("id", "=", userId,).execute();

        return jsonResponse({ ok: true, },);
      },
      {
        body: UserProfileUpdateBody,
        detail: {
          summary: "Update current user",
          description: "Update the authenticated user's profile (display name, birth date, settings).",
          tags: ["Users",],
        },
      },
    )
    .get(
      "/api/users/:id",
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = (ctx as any).userRole as string | null;
        const targetId = (ctx as any).params.id as string;

        // Non-admin can only view own profile via /api/users/me
        if (userRole !== "admin") {
          return forbidden();
        }

        const user = await opts.database
          .selectFrom("users",)
          .select(["id", "username", "display_name", "role", "created_at", "last_seen_at",],)
          .where("id", "=", targetId,)
          .executeTakeFirst();

        if (!user) { return notFound("User not found",); }
        return jsonResponse(user,);
      },
      {
        params: UserIdParams,
        detail: {
          summary: "Get user by ID",
          description: "Get a user's profile by ID. Admin only.",
          tags: ["Users",],
        },
      },
    )
    .put(
      "/api/users/:id",
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = (ctx as any).userRole as string | null;
        const targetId = (ctx as any).params.id as string;
        const body = (ctx as any).body as typeof UserProfileUpdateBody;

        // User can update own profile; admin can update any
        if (targetId !== userId && userRole !== "admin") {
          return forbidden();
        }

        const updates: Record<string, unknown> = {};
        if (body.displayName !== undefined) { updates.display_name = body.displayName; }
        if (body.settings) {
          const settingsResult = safeJsonStringify(body.settings,);
          if (!settingsResult.ok) {
            return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest, },);
          }
          updates.settings = settingsResult.value;
        }

        // Check target user exists
        const targetUser = await opts.database
          .selectFrom("users",)
          .select("id",)
          .where("id", "=", targetId,)
          .executeTakeFirst();
        if (!targetUser) { return notFound("User not found",); }

        await opts.database.updateTable("users",).set(updates,).where("id", "=", targetId,).execute();

        return jsonResponse({ ok: true, },);
      },
      {
        body: UserProfileUpdateBody,
        params: UserIdParams,
        detail: {
          summary: "Update user by ID",
          description: "Update a user's profile. Users can update their own; admins can update any.",
          tags: ["Users",],
        },
      },
    )
    .patch(
      "/api/users/me/settings",
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const body = (ctx as any).body as Record<string, unknown>;
        const user = await opts.database
          .selectFrom("users",)
          .select(["id", "settings",],)
          .where("id", "=", userId,)
          .executeTakeFirst();

        if (!user) { return notFound("User not found",); }

        const currentSettings = jsonParseOr<Record<string, unknown>>(user.settings ?? "", {},);
        const mergedResult = safeJsonStringify({ ...currentSettings, ...body, },);
        if (!mergedResult.ok) {
          return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest, },);
        }

        await opts.database
          .updateTable("users",)
          .set({ settings: mergedResult.value, },)
          .where("id", "=", userId,)
          .execute();

        return jsonResponse({ ok: true, },);
      },
      {
        detail: {
          summary: "Patch current user settings",
          description: "Merge partial settings into the authenticated user's existing settings.",
          tags: ["Users",],
        },
      },
    )
    .put(
      "/api/users/:id/settings",
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const userRole = (ctx as any).userRole as string | null;
        const targetId = (ctx as any).params.id as string;
        const body = (ctx as any).body as Record<string, unknown>;

        if (targetId !== userId && userRole !== "admin") {
          return forbidden();
        }

        const current = await opts.database
          .selectFrom("users",)
          .select("settings",)
          .where("id", "=", targetId,)
          .executeTakeFirst();

        const currentSettings = current?.settings ? jsonParseOr(current.settings, {},) : {};
        const merged = { ...currentSettings, ...body, };

        const mergedResult = safeJsonStringify(merged,);
        if (!mergedResult.ok) {
          return jsonError({ message: "Invalid settings data", status: HttpStatus.BadRequest, },);
        }

        await opts.database
          .updateTable("users",)
          .set({ settings: mergedResult.value, },)
          .where("id", "=", targetId,)
          .execute();

        return jsonResponse(merged,);
      },
      {
        params: UserIdParams,
        detail: {
          summary: "Replace user settings",
          description: "Replace a user's settings entirely. Users can update their own; admins can update any.",
          tags: ["Users",],
        },
      },
    )
    .delete(
      "/api/users/:id",
      async (ctx,) => {
        const userRole = (ctx as any).userRole as string | null;
        const targetId = (ctx as any).params.id as string;

        if (userRole !== "admin") {
          return forbidden();
        }

        await opts.database.deleteFrom("users",).where("id", "=", targetId,).execute();

        return jsonNoContent();
      },
      {
        params: UserIdParams,
        detail: {
          summary: "Delete user",
          description: "Delete a user. Admin only.",
          tags: ["Users",],
        },
      },
    ) as unknown as Elysia;
}
