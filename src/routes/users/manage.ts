// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * User manage routes — admin/self operations keyed by user ID.
 *
 *   GET  /api/users/:id      — get user by ID (admin or self)
 *   PUT  /api/users/:id      — update user (admin or self)
 *   PUT  /api/users/:id/settings   — replace user settings
 *   DELETE /api/users/:id    — delete user (admin only)
 */
import { Elysia, t, } from "elysia";
import { jsonParseOr, safeJsonStringify, } from "../../utils";
import { forbidden, notFound, } from "../../validation/middleware";
import { ErrorResponse, SuccessResponse, UserIdParams, UserProfileUpdateBody, } from "../../validation/schemas";
import { HttpStatus, jsonError, jsonNoContent, jsonResponse, requireUserId, } from "../http-utils";
import type { UsersRoutesOpts, } from "./types";

export function manageRoutes(opts: UsersRoutesOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "users-manage", },)
      .get(
        `${prefix}/users/:id`,
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
          response: {
            200: t.Any(),
            401: ErrorResponse,
            403: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Get user by ID",
            description: "Get a user's profile by ID. Admin only.",
            tags: ["Users",],
          },
        },
      )
      .put(
        `${prefix}/users/:id`,
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
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
            403: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Update user by ID",
            description: "Update a user's profile. Users can update their own; admins can update any.",
            tags: ["Users",],
          },
        },
      )
      .put(
        `${prefix}/users/:id/settings`,
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
          response: {
            200: t.Any(),
            400: ErrorResponse,
            401: ErrorResponse,
            403: ErrorResponse,
          },
          detail: {
            summary: "Replace user settings",
            description: "Replace a user's settings entirely. Users can update their own; admins can update any.",
            tags: ["Users",],
          },
        },
      )
      .delete(
        `${prefix}/users/:id`,
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
          response: {
            204: t.Void(),
            401: ErrorResponse,
            403: ErrorResponse,
          },
          detail: {
            summary: "Delete user",
            description: "Delete a user. Admin only.",
            tags: ["Users",],
          },
        },
      )
  );
}
