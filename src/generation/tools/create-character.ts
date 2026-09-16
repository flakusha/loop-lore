// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * create_character — builtin assistant tool for LLM-driven character creation.
 *
 * Item 8 / C3 (creation wizards via assistant tool-calls): the assistant can
 * create a character mid-response via a tool call, mirroring the `/create char`
 * command's insert shape (actors table, `actor_type=character`, `agent_type=ai`,
 * `import_spec="assistant-wizard"`). Ownership is bound to the generating actor.
 *
 * The execution context (db + actor + chat) is supplied by `executeToolCalls`
 * at generation time; the registered definition is static.
 */
import { ActorType, AgentType, } from "../../db/enums";
import type { ToolDefinition, ToolResult, } from "../../plugins/types";
import { jsonStringifyOr, uid, } from "../../utils";
import { resolveOwnerUserId, stringParam, } from "./create-wizard-utils";

/** Canonical tool name. */
export const CREATE_CHARACTER = "create_character";

/** JSON Schema parameters exposed to the model. */
const PARAMETERS: Record<string, unknown> = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Display name for the character (required).",
    },
    description: {
      type: "string",
      description: "Short description / hook for the character (required).",
    },
    personality: {
      type: "string",
      description: "Personality summary, immutable core (required).",
    },
    appearance: {
      type: "string",
      description: "Physical appearance — body/face/general look, immutable base (required).",
    },
    defaultOutfit: {
      type: "string",
      description: "Starting outfit id or description (required; seeds the wardrobe).",
    },
    scenario: {
      type: "string",
      description: "Opening scenario or situation.",
    },
    systemPrompt: {
      type: "string",
      description: "Optional system prompt override.",
    },
  },
  required: ["name", "description", "personality", "appearance", "defaultOutfit",],
  additionalProperties: false,
};

/**
 * The builtin character-creation tool definition. Registered at plugin load
 * time (core origin); executed with per-request context.
 */
export const characterCreationTool: ToolDefinition = {
  name: CREATE_CHARACTER,
  description:
    "Create a new roleplay character. Requires name, description, personality, appearance, and defaultOutfit; scenario and system prompt are optional. The character becomes an AI actor owned by the current user.",
  parameters: PARAMETERS,
  handler: async (params, ctx,): Promise<ToolResult> => {
    if (!ctx) {
      return { content: '{"error":"create_character requires generation context"}', isError: true, };
    }

    const name = stringParam(params, "name",);
    if (!name) {
      return { content: '{"error":"name is required and must be non-empty"}', isError: true, };
    }

    const description = stringParam(params, "description",);
    if (!description) {
      return { content: '{"error":"description is required and must be non-empty"}', isError: true, };
    }
    const personality = stringParam(params, "personality",);
    if (!personality) {
      return { content: '{"error":"personality is required and must be non-empty"}', isError: true, };
    }
    const appearance = stringParam(params, "appearance",);
    if (!appearance) {
      return { content: '{"error":"appearance is required and must be non-empty"}', isError: true, };
    }
    const defaultOutfit = stringParam(params, "defaultOutfit",);
    if (!defaultOutfit) {
      return { content: '{"error":"defaultOutfit is required and must be non-empty"}', isError: true, };
    }
    const scenario = stringParam(params, "scenario",);
    const systemPrompt = stringParam(params, "systemPrompt",);

    const ownerId = await resolveOwnerUserId(ctx.db, ctx.actorId,);

    // Wizard takes a single outfit id; seed the wardrobe catalog with it so the
    // row satisfies the spec mandatory set (≥1 outfit + matching default).
    const outfits = jsonStringifyOr([{ id: defaultOutfit, name: defaultOutfit, descriptor: defaultOutfit, },],);
    const id = uid();
    await ctx.db
      .insertInto("actors",)
      .values({
        id,
        actor_type: ActorType.Character,
        display_name: name,
        user_id: ownerId,
        owner_id: ownerId,
        agent_type: AgentType.Ai,
        description,
        system_prompt: systemPrompt ?? null,
        settings: "{}",
        personality,
        appearance,
        default_outfit: defaultOutfit,
        outfits,
        scenario: scenario ?? null,
        import_spec: "assistant-wizard",
      },)
      .execute();

    return {
      content: jsonStringifyOr({ ok: true, id, name, },),
      metadata: { id, name, },
    };
  },
};
