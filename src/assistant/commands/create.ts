/**
 * /create — Create game entities from a description.
 *
 * Subcommands:
 *   /create char <desc>   — Create a character
 *   /create loc <desc>    — Create a location
 *   /create world <desc>  — Create a world
 *   /create item <desc>   — Create an item
 *
 * Uses the generation pipeline with entity-specific prompt templates.
 * Results are stored in the appropriate tables (actors, locations, worlds, items).
 */

import { loadConfig, } from "../../config/load";
import { DifficultyReroll, DifficultyState, } from "../../db/enums-story";
import { getDatabase, } from "../../db/index";
import { resolveProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, } from "../../generation/providers/types";
import { uid, } from "../../utils";
import { type CommandResult, registerCommand, } from "./registry";

const typeLabels: Record<string, string> = {
  char: "character",
  character: "character",
  loc: "location",
  location: "location",
  world: "world",
  item: "item",
};

const entityPrompts: Record<string, (desc: string,) => string> = {
  char: (desc,) =>
    `Generate a character profile from this description. Return JSON with: name (string), description (string, 1-2 paragraphs), personality (string), scenario (string, 1 sentence). Description: ${desc}`,
  character: (desc,) =>
    `Generate a character profile from this description. Return JSON with: name (string), description (string, 1-2 paragraphs), personality (string), scenario (string, 1 sentence). Description: ${desc}`,
  loc: (desc,) =>
    `Generate a location from this description. Return JSON with: name (string), description (string, 1-2 paragraphs). Description: ${desc}`,
  location: (desc,) =>
    `Generate a location from this description. Return JSON with: name (string), description (string, 1-2 paragraphs). Description: ${desc}`,
  world: (desc,) =>
    `Generate a world setting from this description. Return JSON with: name (string), description (string, 1-2 paragraphs), lore (string, 1 paragraph). Description: ${desc}`,
  item: (desc,) =>
    `Generate an item from this description. Return JSON with: name (string), description (string, 1 paragraph). Description: ${desc}`,
};

/** Build the standard create-entity CommandResult. */
function createEntityResult(
  entityLabel: string,
  entityData: Record<string, string | undefined>,
  description: string,
  id: string,
  label: string,
): CommandResult {
  return {
    systemMessage: `**${entityLabel} created:** ${entityData.name ?? "Unnamed"}\n\n${
      entityData.description ?? description
    }`,
    action: "create-entity",
    actionPayload: { entityType: label, id, name: entityData.name, },
    handled: true,
  };
}

registerCommand("create", async (args, ctx,): Promise<CommandResult> => {
  const entityType = (args[0] || "").toLowerCase();
  const description = args.slice(1,).join(" ",).trim();

  const validTypes = ["char", "character", "loc", "location", "world", "item",];

  if (!entityType || !validTypes.includes(entityType,)) {
    return {
      systemMessage: "Usage: /create <char|loc|world|item> <description>",
      handled: true,
    };
  }

  if (!description) {
    return {
      systemMessage: `Usage: /create ${entityType} <description>`,
      handled: true,
    };
  }

  const config = loadConfig();
  const db = getDatabase();

  try {
    const resolved = await resolveProvider({ config, },);

    const genReq: GenerateRequest = {
      model: resolved.resolvedModel,
      messages: [
        {
          role: "system",
          content:
            "You are a game master assistant. Generate structured entity data as valid JSON. Do not include markdown formatting or code blocks.",
        },
        { role: "user", content: entityPrompts[entityType]!(description,), },
      ],
      params: { maxTokens: 512, temperature: 0.7, },
    };

    const result = await resolved.provider.complete(genReq,);
    const content = result.content.trim();

    // Parse JSON response
    let entityData: Record<string, string | undefined>;
    try {
      // Remove markdown code fences if present
      const cleaned = content.replace(/^```(?:json)?\s*\n?/, "",).replace(/\n?```\s*$/, "",);
      entityData = JSON.parse(cleaned,) as Record<string, string>;
    } catch {
      return {
        systemMessage: `**Failed to parse entity data from LLM response.**\n\nRaw output:\n${content.slice(0, 500,)}`,
        handled: true,
      };
    }

    const id = uid();
    const label = typeLabels[entityType] ?? entityType;

    switch (entityType) {
      case "char":
      case "character": {
        await db
          .insertInto("actors",)
          .values({
            id,
            actor_type: "character",
            display_name: entityData.name ?? "Unnamed Character",
            user_id: ctx.userId ?? "",
            owner_id: ctx.userId ?? "",
            agent_type: "ai",
            description: entityData.description ?? description,
            system_prompt: null,
            settings: "{}",
            personality: entityData.personality ?? null,
            scenario: entityData.scenario ?? null,
            import_spec: "llm-generated",
          },)
          .execute();

        return createEntityResult("Character", entityData, description, id, label,);
      }

      case "loc":
      case "location": {
        // Get current world from chat context or default
        const chat = ctx.activeChat;
        const worldId = chat?.type ?? "default";

        await db
          .insertInto("locations",)
          .values({
            id,
            world_id: worldId,
            name: entityData.name ?? "Unnamed Location",
            description: entityData.description ?? description,
            connections: "[]",
          },)
          .execute();

        return createEntityResult("Location", entityData, description, id, label,);
      }

      case "world": {
        await db
          .insertInto("worlds",)
          .values({
            id,
            owner_id: ctx.userId ?? "",
            name: entityData.name ?? "Unnamed World",
            description: entityData.description ?? description,
            lore: entityData.lore ?? null,
            difficulty_modifier: 1,
            difficulty_reroll: DifficultyReroll.None,
            difficulty_state: DifficultyState.Normal,
          },)
          .execute();

        return createEntityResult("World", entityData, description, id, label,);
      }

      case "item": {
        // Items need a world context
        const chat = ctx.activeChat;
        const worldId = chat?.type ?? "default";

        await db
          .insertInto("items",)
          .values({
            id,
            world_id: worldId,
            name: entityData.name ?? "Unnamed Item",
            description: entityData.description ?? description,
            category: "other",
            rarity: "common",
            stackable: "unique",
            max_stack: 1,
            properties: "{}",
            value: 0,
            weight: 1,
          },)
          .execute();

        return createEntityResult("Item", entityData, description, id, label,);
      }

      default: {
        return {
          systemMessage: `Unsupported entity type: ${entityType}`,
          handled: true,
        };
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return {
      systemMessage: `**Entity creation failed:** ${msg}`,
      handled: true,
    };
  }
},);
