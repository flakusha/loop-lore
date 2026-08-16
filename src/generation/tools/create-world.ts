// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * create_world — builtin assistant tool for LLM-driven world creation.
 *
 * Item 8 / C3 (creation wizards via assistant tool-calls): the assistant can
 * create a world mid-response via a tool call, mirroring the `/create world`
 * command's insert shape (worlds table, difficulty defaults, owner-bound).
 *
 * The execution context (db + actor + chat) is supplied by `executeToolCalls`
 * at generation time; the registered definition is static.
 */
import { DifficultyReroll, DifficultyState, } from "../../db/enums";
import type { ToolDefinition, ToolResult, } from "../../plugins/types";
import { jsonStringifyOr, uid, } from "../../utils";
import { resolveOwnerUserId, stringParam, } from "./create-wizard-utils";

/** Canonical tool name. */
export const CREATE_WORLD = "create_world";

/** JSON Schema parameters exposed to the model. */
const PARAMETERS: Record<string, unknown> = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Name of the world.",
    },
    description: {
      type: "string",
      description: "1-2 paragraph world description.",
    },
    lore: {
      type: "string",
      description: "Optional lore paragraph for the world.",
    },
  },
  required: ["name",],
  additionalProperties: false,
};

/**
 * The builtin world-creation tool definition. Registered at plugin load time
 * (core origin); executed with per-request context.
 */
export const worldCreationTool: ToolDefinition = {
  name: CREATE_WORLD,
  description:
    "Create a new world setting. Provide a name (required) and optionally a description and lore. The world is owned by the current user.",
  parameters: PARAMETERS,
  handler: async (params, ctx,): Promise<ToolResult> => {
    if (!ctx) {
      return { content: '{"error":"create_world requires generation context"}', isError: true, };
    }

    const name = stringParam(params, "name",);
    if (!name) {
      return { content: '{"error":"name is required and must be non-empty"}', isError: true, };
    }

    const description = stringParam(params, "description",);
    const lore = stringParam(params, "lore",);

    const ownerId = await resolveOwnerUserId(ctx.db, ctx.actorId,);
    if (!ownerId) {
      return { content: '{"error":"create_world requires an owning user (actor has none)"}', isError: true, };
    }

    const id = uid();
    await ctx.db
      .insertInto("worlds",)
      .values({
        id,
        owner_id: ownerId,
        name,
        description: description ?? null,
        lore: lore ?? null,
        difficulty_modifier: 1,
        difficulty_reroll: DifficultyReroll.None,
        difficulty_state: DifficultyState.Normal,
      },)
      .execute();

    return {
      content: jsonStringifyOr({ ok: true, id, name, },),
      metadata: { id, name, },
    };
  },
};
