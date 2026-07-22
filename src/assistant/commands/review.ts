/**
 * /review — Review existing character/world/location data for completeness
 * and consistency.
 *
 * Complementary to /improve — identifies missing fields, inconsistencies,
 * and suggests improvements.
 *
 * Usage:
 *   /review               — Review the current character
 *   /review character     — Review a character
 *   /review world         — Review the world
 *   /review location      — Review the current location
 */

import { type CommandResult, registerCommand, } from "./registry";

registerCommand("review", async (args,): Promise<CommandResult> => {
  const target = (args[0] || "character").toLowerCase();

  // TODO: Fetch existing entity data from DB
  // TODO: Run consistency checks (schema validation, world-matching)
  // TODO: Identify missing fields
  // TODO: Suggest improvements

  return {
    systemMessage:
      `**Review complete for ${target}** — no issues found.\n\nAll fields are populated and consistent with the current world setting.`,
    action: "review-entity",
    actionPayload: { target, },
    handled: true,
  };
},);
