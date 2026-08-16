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
      description: "Display name of the character.",
    },
    description: {
      type: "string",
      description: "1-2 paragraph backstory/description.",
    },
    personality: {
      type: "string",
      description: "Personality summary for the character.",
    },
    scenario: {
      type: "string",
      description: "One-sentence starting scenario.",
    },
    systemPrompt: {
      type: "string",
      description: "Optional system prompt guiding the character's behavior.",
    },
  },
  required: ["name",],
  additionalProperties: false,
};

/**
 * The builtin character-creation tool definition. Registered at plugin load
 * time (core origin); executed with per-request context.
 */
export const characterCreationTool: ToolDefinition = {
  name: CREATE_CHARACTER,
  description:
    "Create a new roleplay character. Provide a name (required) and optionally a description, personality, scenario, and system prompt. The character becomes an AI actor owned by the current user.",
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
    const personality = stringParam(params, "personality",);
    const scenario = stringParam(params, "scenario",);
    const systemPrompt = stringParam(params, "systemPrompt",);

    const ownerId = await resolveOwnerUserId(ctx.db, ctx.actorId,);

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
        description: description ?? null,
        system_prompt: systemPrompt ?? null,
        settings: "{}",
        personality: personality ?? null,
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
