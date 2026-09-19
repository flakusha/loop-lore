// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { assertNoCrossBoundaryWrite, } from "../../characters/world-boundary";
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
import { clampFocusPercent, rejectClearedCharacterFields, } from "./update-helpers";


// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 260

/**
 * @param opts - handler options (database)
 * @param prefix - route prefix
 * @returns the Elysia character-update routes
 */
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

        // CHAR-1: optimistic concurrency version is REQUIRED. Without it,
        // concurrent edits silently overwrite each other (last-write-wins).
        // Clients send `dataVersion` from the prior GET response.
        if (dataVersion === undefined) {
          return jsonError({
            message: ctx.t?.("characters.dataVersionRequired",) ??
              "dataVersion is required for concurrent-edit safety. Re-fetch the actor and retry.",
            status: HttpStatus.BadRequest,
          },);
        }

        if (dataVersion !== actor.format_version) {
          return jsonError({
            message: "Version conflict: record was modified by another process",
            status: HttpStatus.Conflict,
          },);
        }

        // TASK-031: character/world boundary. A body carrying world-owned
        // fields is misdirected (the handler would silently drop them) -
        // reject it and point the client at the world API instead.
        const boundary = assertNoCrossBoundaryWrite(
          "character",
          Object.keys(ctx.body as Record<string, unknown>,),
        );
        if (!boundary.ok) {
          return jsonError({ message: boundary.error.message, status: HttpStatus.UnprocessableEntity, },);
        }

        const updates = buildActorUpdates(ctx.body,);
        // Spec-required fields (description/personality/appearance + wardrobe) are
        // enforced at the import/validator layer, not on partial PUTs: actors rows
        // double as skeletal drafts and legacy rows predate the wardrobe columns.
        // Only validate internal consistency when the request touches the wardrobe,
        // merging single-half updates with the stored row so a defaultOutfit-only
        // save validates against existing outfits (and vice versa).
        // Type-agnostic: POST /api/actors defaults actor_type to "user", so a
        // character check here would never fire; the pair check is valid for any
        // actor carrying wardrobe fields.
        const cleared = rejectClearedCharacterFields(ctx.body, actor,);
        if (cleared) {
          return jsonError({ message: cleared, status: HttpStatus.BadRequest, },);
        }
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
          422: ErrorResponse,
        },
        detail: {
          summary: "Update actor",
          description: "Update a character or actor. Owner or admin only.",
          tags: ["Characters",],
        },
      },
    );
}

/**
 * Assemble the update column map from the request body (non-empty fields).
 * @param body - validated update body
 * @returns the column update map
 */
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
    appearance,
    defaultOutfit,
    outfits,
    welcomeMessage,
    mesExample,
    scenario,
    postHistoryInstructions,
    creatorNotes,
    creator,
    characterVersion,
    growthMode,
    llmAssistEnabled,
    avatarFocusX,
    avatarFocusY,
  } = body;
  if (displayName) { updates.display_name = displayName; }
  if (description) { updates.description = description; }
  if (systemPrompt) { updates.system_prompt = systemPrompt; }
  if (agentRole !== undefined) { updates.agent_role = agentRole; }
  if (avatarAssetId !== undefined) { updates.avatar_asset_id = avatarAssetId; }
  if (contentRating !== undefined) { updates.content_rating = contentRating; }
  if (personality) { updates.personality = personality; }
  if (appearance) { updates.appearance = appearance; }
  if (defaultOutfit !== undefined) { updates.default_outfit = defaultOutfit; }
  if (outfits !== undefined) { updates.outfits = outfits; }
  if (welcomeMessage) { updates.welcome_message = welcomeMessage; }
  if (mesExample) { updates.mes_example = mesExample; }
  if (scenario) { updates.scenario = scenario; }
  if (postHistoryInstructions) { updates.post_history_instructions = postHistoryInstructions; }
  if (creatorNotes) { updates.creator_notes = creatorNotes; }
  if (creator) { updates.creator = creator; }
  if (characterVersion) { updates.character_version = characterVersion; }
  if (growthMode !== undefined) { updates.growth_mode = growthMode; }
  if (llmAssistEnabled !== undefined) { updates.llm_assist_enabled = llmAssistEnabled ? 1 : 0; }
  if (avatarFocusX !== undefined) { updates.avatar_focus_x = clampFocusPercent(avatarFocusX,); }
  if (avatarFocusY !== undefined) { updates.avatar_focus_y = clampFocusPercent(avatarFocusY,); }
  return updates;
}
