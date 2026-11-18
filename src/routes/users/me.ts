// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * User profile routes — the authenticated user's own profile + settings.
 *
 *   GET  /api/users/me       — current user profile
 *   PUT  /api/users/me       — update own profile
 *   PATCH /api/users/me/settings — merge settings
 *   DELETE /api/users/me      — delete the authenticated user's data
 */
import { Elysia, t, } from "elysia";
import { validateAge, } from "../../age-gate/service";
import { AssetLinkEntity, } from "../../db/enums";
import { isWellFormedBcp47, } from "../../i18n/bcp47";
import { jsonParseOr, safeJsonStringify, } from "../../utils";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, SuccessResponse, UserProfileUpdateBody, } from "../../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { UsersRoutesOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { users: { me: { get: { ...; }; }; }; }; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
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
          // FEAT-language-selection-three-level: the content-locale preference
          // is validated for BCP-47 well-formedness at the boundary — free-form
          // tags (any language, not just the 10 UI-registry codes) are
          // accepted; malformed values are a 400 before the settings merge.
          if (
            body.contentLocale !== undefined &&
            body.contentLocale !== null &&
            // An empty string means "no content-language preference" — the
            // settings page sends it when the selector is left unset.
            body.contentLocale !== "" &&
            (typeof body.contentLocale !== "string" || !isWellFormedBcp47(body.contentLocale,))
          ) {
            return jsonError({
              message: `Malformed contentLocale: "${String(body.contentLocale,)}".`,
              status: HttpStatus.BadRequest,
            },);
          }

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
      .delete(
        `${prefix}/users/me`,
        async (ctx,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          await opts.database.transaction().execute(async (trx,) => {
            // created_by predates chat_owners; both identify this user's chats.
            const ownedChatIds = trx
              .selectFrom("chats",)
              .select("id",)
              .where((eb,) =>
                eb.or([
                  eb("created_by", "=", userId,),
                  eb("id", "in", trx.selectFrom("chat_owners",).select("chat_id",).where("user_id", "=", userId,),),
                ],)
              );

            const ownedMessageIds = trx
              .selectFrom("messages",)
              .select("id",)
              .where("chat_id", "in", ownedChatIds,);

            const ownedTurnIds = trx
              .selectFrom("story_turns",)
              .select("id",)
              .where("chat_id", "in", ownedChatIds,);

            const ownedMemoryIds = trx
              .selectFrom("actor_memories",)
              .select("id",)
              .where((eb,) => eb.or([eb("user_id", "=", userId,), eb("source_chat_id", "in", ownedChatIds,),],));

            // NO ACTION FKs go first; the rest mirrors deleteChat's cascade,
            // scoped to this user's chats so other users' rows stay untouched.
            await trx.deleteFrom("interaction_logs",).where("chat_id", "in", ownedChatIds,).execute();
            await trx.deleteFrom("game_states",).where("chat_id", "in", ownedChatIds,).execute();
            await trx.deleteFrom("chat_branches",).where("chat_id", "in", ownedChatIds,).execute();
            await trx
              .deleteFrom("world_states",)
              .where((eb,) =>
                eb.or([eb("trigger_message_id", "in", ownedMessageIds,), eb("trigger_turn_id", "in", ownedTurnIds,),],)
              )
              .execute();

            await trx.deleteFrom("generation_attempts",).where("chat_id", "in", ownedChatIds,).execute();
            await trx.deleteFrom("story_turns",).where("chat_id", "in", ownedChatIds,).execute();
            await trx.deleteFrom("quest_progress",).where("chat_id", "in", ownedChatIds,).execute();
            await trx.deleteFrom("synthetic_data",).where("chat_id", "in", ownedChatIds,).execute();
            await trx
              .deleteFrom("actor_memories",)
              .where((eb,) => eb.or([eb("user_id", "=", userId,), eb("source_chat_id", "in", ownedChatIds,),],))
              .execute();

            await trx.deleteFrom("branch_merge_sources",).where("tip_message_id", "in", ownedMessageIds,).execute();
            await trx.deleteFrom("branch_merges",).where("chat_id", "in", ownedChatIds,).execute();
            await trx.deleteFrom("whitenotes",).where("message_id", "in", ownedMessageIds,).execute();
            // asset_links is polymorphic: no FK cascades these references.
            await trx.deleteFrom("asset_links",).where("entity_type", "=", AssetLinkEntity.Chat,).where(
              "entity_id",
              "in",
              ownedChatIds,
            ).execute();

            await trx.deleteFrom("asset_links",).where("entity_type", "=", AssetLinkEntity.Message,).where(
              "entity_id",
              "in",
              ownedMessageIds,
            ).execute();

            await trx.deleteFrom("asset_links",).where("entity_type", "=", AssetLinkEntity.Memory,).where(
              "entity_id",
              "in",
              ownedMemoryIds,
            ).execute();

            await trx.deleteFrom("messages",).where("chat_id", "in", ownedChatIds,).execute();
            await trx.deleteFrom("chat_participants",).where("chat_id", "in", ownedChatIds,).execute();
            await trx.deleteFrom("chats",).where("id", "in", ownedChatIds,).execute();
            await trx.deleteFrom("auth_challenges",).where("user_id", "=", userId,).execute();
            await trx.deleteFrom("auth_factors",).where("user_id", "=", userId,).execute();
            await trx.deleteFrom("sessions",).where("user_id", "=", userId,).execute();
          },);

          return jsonResponse({ ok: true, },);
        },
        {
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
          },
          detail: {
            summary: "Delete current user's data",
            description:
              "Permanently delete the authenticated user's owned data (chats, messages, memories, sessions).",
            tags: ["Users",],
          },
        },
      )
  );
}
