// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * create_location — builtin assistant tool for LLM-driven location creation.
 *
 * Item 8 / C3 (creation wizards via assistant tool-calls): the assistant can
 * create a location mid-response via a tool call, mirroring the `/create loc`
 * command's insert shape (locations table) plus the same bound-chat creation
 * so the location is immediately reachable and joinable.
 *
 * The execution context (db + actor + chat) is supplied by `executeToolCalls`
 * at generation time; the registered definition is static.
 */
import { createChat, getChatSetupTemplate, } from "../../chat/service";
import type { ToolDefinition, ToolResult, } from "../../plugins/types";
import { jsonStringifyOr, safeJsonParse, uid, } from "../../utils";
import { resolveOwnerUserId, resolveWorldId, stringParam, } from "./create-wizard-utils";

/** Canonical tool name. */
export const CREATE_LOCATION = "create_location";

/** JSON Schema parameters exposed to the model. */
const PARAMETERS: Record<string, unknown> = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Name of the location.",
    },
    description: {
      type: "string",
      description: "1-2 paragraph location description.",
    },
    worldId: {
      type: "string",
      description: "World id the location belongs to (defaults to the current chat's world).",
    },
  },
  required: ["name",],
  additionalProperties: false,
};

/**
 * The builtin location-creation tool definition. Registered at plugin load
 * time (core origin); executed with per-request context.
 */
export const locationCreationTool: ToolDefinition = {
  name: CREATE_LOCATION,
  description:
    "Create a new location in a world. Provide a name (required) and optionally a description and world id. A bound chat is auto-created so the location is immediately reachable.",
  parameters: PARAMETERS,
  handler: async (params, ctx,): Promise<ToolResult> => {
    if (!ctx) {
      return { content: '{"error":"create_location requires generation context"}', isError: true, };
    }

    const name = stringParam(params, "name",);
    if (!name) {
      return { content: '{"error":"name is required and must be non-empty"}', isError: true, };
    }

    const description = stringParam(params, "description",);
    const worldId = await resolveWorldId(ctx.db, ctx.chatId, stringParam(params, "worldId",),);

    // The bound chat's `created_by` references users.id (mirrors `/create loc`,
    // which uses the user id for both the chat owner and participant actor).
    const ownerId = await resolveOwnerUserId(ctx.db, ctx.actorId,);

    const id = uid();
    await ctx.db
      .insertInto("locations",)
      .values({
        id,
        world_id: worldId,
        name,
        description: description ?? null,
        connections: "[]",
      },)
      .execute();

    // Mirror the REST location creation: auto-create a public chat bound to the
    // default `world` template so the location is immediately reachable.
    const template = await getChatSetupTemplate(ctx.db, "template-world",);
    if (template && ownerId) {
      const gmParsed = template.gm_config
        ? safeJsonParse<Record<string, unknown>>(template.gm_config,)
        : null;
      await createChat(ctx.db, {
        name,
        type: "group",
        mode: template.mode ?? "story",
        createdBy: ownerId,
        worldId,
        currentLocationId: id,
        turnStrategy: template.turn_strategy,
        gmConfig: gmParsed?.ok ? gmParsed.value : null,
        renderingOverride: gmParsed?.ok && gmParsed.value.renderingOverride === "visual_novel"
          ? "visual_novel"
          : null,
        visibility: template.visibility ?? "private",
        templateId: template.id,
      },);
    }

    return {
      content: jsonStringifyOr({ ok: true, id, name, worldId, },),
      metadata: { id, name, worldId, },
    };
  },
};
