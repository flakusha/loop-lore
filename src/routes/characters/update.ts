// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { updateWithVersionCheck, } from "../../db/optimistic-locking";
import { can, } from "../../users/permissions";
import { safeJsonStringify, } from "../../utils";
import {
  ActorIdParams,
  ActorUpdateBody,
  ErrorResponse,
  SuccessResponse,
} from "../../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

export function updateRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "characters-update", },)
    .put(
      `${prefix}/actors/:actorId`,
      async (ctx: any,) => {
        const { settings, dataVersion, } = ctx.body as { settings?: unknown; dataVersion?: number };
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const actor = await database
          .selectFrom("actors",)
          .selectAll()
          .where("id", "=", ctx.params.actorId,)
          .executeTakeFirst();
        if (!actor) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        if (actor.owner_id !== userId && !can(ctx.userRole, "admin.character",)) {
          return jsonError({ message: ctx.t?.("errors.forbidden",) ?? "Forbidden", status: HttpStatus.Forbidden, },);
        }

        // Optimistic concurrency check
        if (dataVersion !== undefined && dataVersion !== actor.format_version) {
          return jsonError({
            message: "Version conflict: record was modified by another process",
            status: HttpStatus.Conflict,
          },);
        }

        const updates = buildActorUpdates(ctx.body,);
        if (settings !== undefined) {
          const settingsResult = safeJsonStringify(settings,);
          if (!settingsResult.ok) {
            return jsonError({
              message: ctx.t?.("users.invalidSettingsData",) ?? "Invalid settings data",
              status: HttpStatus.BadRequest,
            },);
          }
          updates.settings = settingsResult.value;
        }

        // Use optimistic locking
        const result = await updateWithVersionCheck(
          database,
          "actors",
          ctx.params.actorId,
          actor.format_version,
          updates,
        );

        if (!result.ok) {
          return jsonError({ message: result.error ?? "Update failed", status: HttpStatus.Conflict, },);
        }

        return jsonResponse({ ok: true, dataVersion: actor.format_version + 1, },);
      },
      {
        params: ActorIdParams,
        body: ActorUpdateBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
        },
        detail: {
          summary: "Update actor",
          description: "Update a character or actor. Owner or admin only.",
          tags: ["Characters",],
        },
      },
    );
}

/** Assemble the update column map from the request body (non-empty fields). */
function buildActorUpdates(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const {
    displayName,
    description,
    systemPrompt,
    agentRole,
    avatarAssetId,
    contentRating,
    personality,
    welcomeMessage,
    mesExample,
    scenario,
    postHistoryInstructions,
    creatorNotes,
    creator,
    characterVersion,
  } = body;
  if (displayName) { updates.display_name = displayName; }
  if (description) { updates.description = description; }
  if (systemPrompt) { updates.system_prompt = systemPrompt; }
  if (agentRole !== undefined) { updates.agent_role = agentRole; }
  if (avatarAssetId !== undefined) { updates.avatar_asset_id = avatarAssetId; }
  if (contentRating !== undefined) { updates.content_rating = contentRating; }
  if (personality) { updates.personality = personality; }
  if (welcomeMessage) { updates.welcome_message = welcomeMessage; }
  if (mesExample) { updates.mes_example = mesExample; }
  if (scenario) { updates.scenario = scenario; }
  if (postHistoryInstructions) { updates.post_history_instructions = postHistoryInstructions; }
  if (creatorNotes) { updates.creator_notes = creatorNotes; }
  if (creator) { updates.creator = creator; }
  if (characterVersion) { updates.character_version = characterVersion; }
  return updates;
}
