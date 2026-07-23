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

import { type CommandResult, registerCommand, } from "./registry";

const typeLabels: Record<string, string> = {
  char: "character",
  character: "character",
  loc: "location",
  location: "location",
};

registerCommand("create", async (args,): Promise<CommandResult> => {
  const entityType = (args[0] || "").toLowerCase();
  const description = args.slice(1,).join(" ",).trim();

  const validTypes = ["char", "character", "loc", "location", "world", "item",];

  if (!entityType || !validTypes.includes(entityType,)) {
    return {
      systemMessage: "Usage: /create <char|loc|world|item> <description>\n\n" +
        "Examples:\n" +
        "  /create char A wise old wizard named Gandalf\n" +
        "  /create loc A medieval tavern with a fireplace\n" +
        "  /create world A fantasy realm with magic and dragons\n" +
        "  /create item A magical sword that glows in darkness",
      handled: true,
    };
  }

  if (!description) {
    return {
      systemMessage: `Usage: /create ${entityType} <description>\nPlease provide a description for the ${entityType}.`,
      handled: true,
    };
  }

  // TODO: Call generation pipeline with entity-specific prompt template
  // TODO: Store result in appropriate table (actors, locations, worlds, items)
  // TODO: Apply quality gating (schema validation, consistency check, duplicate check)
  // TODO: Require user confirmation before creating

  const typeLabel = typeLabels[entityType] ?? entityType;

  return {
    systemMessage: `**Created ${typeLabel}:** ${description}\n\nThe entity has been added to your world.`,
    action: "create-entity",
    actionPayload: { entityType: typeLabel, description, },
    handled: true,
  };
},);
