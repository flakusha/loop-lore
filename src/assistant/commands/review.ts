// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils";
import { type CommandResult, registerCommand, } from "./registry";

interface ReviewIssue {
  field: string;
  issue: string;
  severity: "warning" | "error" | "info";
}

/**
 * @param items
 * @param prefix
 */
function formatIssueLines(items: ReviewIssue[], prefix: string,): string {
  return Array.from(items, (i,) => `- ${prefix} ${i.field}: ${i.issue}`,).join("\n",);
}

/**
 * Format a review report from issues.
 * Shared by character, world, and location review cases.
 * @param entityLabel
 * @param entityName
 * @param issues
 */
function formatReviewReport(entityLabel: string, entityName: string, issues: ReviewIssue[],): string {
  let report = `**${entityLabel} Review: ${entityName}**\n\n`;

  if (issues.length === 0) {
    report += `✅ ${entityLabel} is well-defined with sufficient detail.`;
    return report;
  }

  const errors: typeof issues = [];
  const warnings: typeof issues = [];
  const info: typeof issues = [];
  for (const i of issues) {
    if (i.severity === "error") { errors.push(i,); }
    else if (i.severity === "warning") { warnings.push(i,); }
    else { info.push(i,); }
  }

  if (errors.length > 0) {
    report += `**Errors (${errors.length}):**\n`;
    report += `${formatIssueLines(errors, "❌",)}\n\n`;
  }
  if (warnings.length > 0) {
    report += `**Warnings (${warnings.length}):**\n`;
    report += `${formatIssueLines(warnings, "⚠️",)}\n\n`;
  }
  if (info.length > 0) {
    report += `**Suggestions (${info.length}):**\n`;
    report += `${formatIssueLines(info, "💡",)}\n\n`;
  }

  report += `**Summary:** ${errors.length} errors, ${warnings.length} warnings, ${info.length} suggestions`;
  return report;
}

registerCommand("review", async (args, ctx,): Promise<CommandResult> => {
  const target = (args[0] || "character").toLowerCase();
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Review unavailable:** command context missing database.", handled: true, };
  }

  const worldId = ctx.activeChat?.worldId ?? "default";

  switch (target) {
    case "character":
    case "char": {
      return reviewCharacter(db, ctx.userId ?? "",);
    }
    case "world": {
      return reviewWorld(db, worldId,);
    }
    case "location":
    case "loc": {
      return reviewLocation(db, worldId,);
    }
    default: {
      return {
        systemMessage: "Usage: /review <character|world|location>",
        handled: true,
      };
    }
  }
},);

/**
 * Review the most recently created character owned by the user.
 * @param db
 * @param userId
 */
async function reviewCharacter(db: Kysely<DB>, userId: string,): Promise<CommandResult> {
  const actor = await db
    .selectFrom("actors",)
    .where("user_id", "=", userId,)
    .orderBy("created_at", "desc",)
    .select(["id",],)
    .executeTakeFirst();

  if (!actor?.id) {
    return {
      systemMessage: "No character found to review. Create a character first with /create char.",
      handled: true,
    };
  }

  const character = await db
    .selectFrom("actors",)
    .where("id", "=", actor.id,)
    .selectAll()
    .executeTakeFirst();

  if (!character) {
    return { systemMessage: "Character not found.", handled: true, };
  }

  const issues: ReviewIssue[] = [];
  if (!character.description) {
    issues.push({ field: "description", issue: "Missing description", severity: "error", },);
  }
  if (!character.personality) {
    issues.push({ field: "personality", issue: "Missing personality traits", severity: "warning", },);
  }
  if (!character.scenario) {
    issues.push({ field: "scenario", issue: "Missing scenario context", severity: "warning", },);
  }
  if (!character.system_prompt) {
    issues.push({ field: "system_prompt", issue: "No custom system prompt", severity: "info", },);
  }
  if (!character.mes_example) {
    issues.push({ field: "mes_example", issue: "No example messages", severity: "info", },);
  }
  if (!character.welcome_message) {
    issues.push({ field: "welcome_message", issue: "No welcome message", severity: "info", },);
  }
  if (character.display_name.length < 2) {
    issues.push({ field: "display_name", issue: "Name too short", severity: "warning", },);
  }
  if (character.description && character.description.length < 50) {
    issues.push({ field: "description", issue: "Description is very brief (under 50 chars)", severity: "info", },);
  }

  return {
    systemMessage: formatReviewReport("Character", character.display_name, issues,),
    action: "review-entity",
    actionPayload: { target: "character", issues, },
    handled: true,
  };
}

/**
 * Review the active world.
 * @param db
 * @param worldId
 */
async function reviewWorld(db: Kysely<DB>, worldId: string,): Promise<CommandResult> {
  const world = await db
    .selectFrom("worlds",)
    .where("id", "=", worldId,)
    .selectAll()
    .executeTakeFirst();

  if (!world) {
    return { systemMessage: "No world found. Create one first with /create world.", handled: true, };
  }

  const issues: ReviewIssue[] = [];
  if (!world.description) {
    issues.push({ field: "description", issue: "Missing world description", severity: "error", },);
  }
  if (!world.lore) {
    issues.push({ field: "lore", issue: "Missing lore/backstory", severity: "warning", },);
  }
  if (world.description && world.description.length < 100) {
    issues.push({ field: "description", issue: "Description is brief (under 100 chars)", severity: "info", },);
  }

  const locationCount = await db
    .selectFrom("locations",)
    .where("world_id", "=", worldId,)
    .select((eb,) => eb.fn.count("id",).as("count",))
    .executeTakeFirst();
  const count = Number(locationCount?.count ?? 0,);
  if (count === 0) {
    issues.push({ field: "locations", issue: "No locations defined", severity: "warning", },);
  } else if (count < 3) {
    issues.push({ field: "locations", issue: `Only ${count} location(s) defined`, severity: "info", },);
  }

  return {
    systemMessage: formatReviewReport("World", world.name, issues,),
    action: "review-entity",
    actionPayload: { target: "world", issues, },
    handled: true,
  };
}

/**
 * Review the most recent location in the active world.
 * @param db
 * @param worldId
 */
async function reviewLocation(db: Kysely<DB>, worldId: string,): Promise<CommandResult> {
  const location = await db
    .selectFrom("locations",)
    .where("world_id", "=", worldId,)
    .orderBy("created_at", "desc",)
    .selectAll()
    .executeTakeFirst();

  if (!location) {
    return { systemMessage: "No location found. Create one first with /create loc.", handled: true, };
  }

  const issues: ReviewIssue[] = [];
  if (!location.description) {
    issues.push({ field: "description", issue: "Missing location description", severity: "error", },);
  }
  if (location.description && location.description.length < 50) {
    issues.push({ field: "description", issue: "Description is brief (under 50 chars)", severity: "info", },);
  }

  const connections = jsonParseOr(location.connections, [],);
  if (connections.length === 0) {
    issues.push({ field: "connections", issue: "No connections to other locations", severity: "warning", },);
  }

  return {
    systemMessage: formatReviewReport("Location", location.name, issues,),
    action: "review-entity",
    actionPayload: { target: "location", issues, },
    handled: true,
  };
}
