// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * User profile routes — the authenticated user's own profile + settings.
 *
 *   GET  /api/users/me       — current user profile
 *   PUT  /api/users/me       — update own profile
 *   PATCH /api/users/me/settings — merge settings
 */
import { Elysia, t, } from "elysia";
import { validateAge, } from "../../age-gate/service";
import { jsonParseOr, safeJsonStringify, } from "../../utils";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, SuccessResponse, UserProfileUpdateBody, } from "../../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { UsersRoutesOpts, } from "./types";

export function meRoutes(opts: UsersRoutesOpts, prefix = "/api",) {
  return (
    new Elysia({ name: "users-me", },)
      .get(
        `${prefix}/users/me`,
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
          response: {
            200: t.Any(),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Get current user",
            description: "Get the authenticated user's profile.",
            tags: ["Users",],
          },
        },
      )
      .put(
        `${prefix}/users/me`,
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
          response: {
            200: SuccessResponse,
            400: ErrorResponse,
            401: ErrorResponse,
          },
          detail: {
            summary: "Update current user",
            description: "Update the authenticated user's profile (display name, birth date, settings).",
            tags: ["Users",],
          },
        },
      )
      .patch(
        `${prefix}/users/me/settings`,
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
          response: {
            200: SuccessResponse,
            400: ErrorResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Patch current user settings",
            description: "Merge partial settings into the authenticated user's existing settings.",
            tags: ["Users",],
          },
        },
      )
  );
}
