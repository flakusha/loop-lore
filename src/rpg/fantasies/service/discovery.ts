// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { FantasyCategory, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { createFantasy, } from "./crud";
import type { DiscoveryResult, } from "./types";

/**
 * Attempt to discover a new fantasy through play.
 *
 * Discovery chance is based on:
 * - Context keywords in the approach
 * - Actor's kink_openness (from desire profile)
 * - Random roll
 * @param db
 * @param actorId
 * @param context
 * @param discoveryChance
 */
export async function attemptDiscovery(
  db: Kysely<DB>,
  actorId: string,
  context: string,
  discoveryChance = 0.1,
): Promise<DiscoveryResult> {
  // Check if already discovered
  const existing = await db
    .selectFrom("character_fantasies",)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .execute();

  const contextLower = context.toLowerCase();
  const alreadyKnown = existing.some(
    (f,) => contextLower.includes(f.fantasy_name.toLowerCase(),),
  );

  if (alreadyKnown) {
    return { discovered: false, reason: "Already known", };
  }

  // Roll for discovery
  if (Math.random() >= discoveryChance) {
    return { discovered: false, reason: "No discovery this time", };
  }

  // Determine category from context keywords
  const category = inferCategory(contextLower,);
  const fantasy = await createFantasy(db, {
    database: db,
    actorId,
    name: inferName(contextLower,),
    category,
    intensity: "mild",
    discoveredThrough: context,
    initialReaction: "neutral",
  },);

  const log = getLogger().child({ module: "fantasies", },);
  log.info(`Fantasy discovered: ${fantasy.name} (${category}) for ${actorId}`,);

  return { discovered: true, fantasy, };
}

/**
 * Infer fantasy category from context keywords.
 * @param context
 */
function inferCategory(context: string,): FantasyCategory {
  if (context.includes("bondage",) || context.includes("restrain",)) { return "bondage"; }
  if (context.includes("public",) || context.includes("expose",)) { return "exhibitionism"; }
  if (context.includes("watch",) || context.includes("peek",)) { return "voyeurism"; }
  if (context.includes("role",) || context.includes("costume",)) { return "roleplay"; }
  if (context.includes("dom",) || context.includes("control",)) { return "power_exchange"; }
  if (context.includes("sub",) || context.includes("obey",)) { return "power_exchange"; }
  if (context.includes("sensation",) || context.includes("touch",)) { return "sensation"; }
  if (context.includes("group",) || context.includes("multiple",)) { return "group"; }
  if (context.includes("pet",) || context.includes("puppy",)) { return "pet_play"; }
  if (context.includes("praise",) || context.includes("compliment",)) { return "praise"; }
  return "roleplay";
}

/**
 * Infer fantasy name from context keywords.
 * @param context
 */
function inferName(context: string,): string {
  const words: string[] = [];
  for (const w of context.split(/\s+/,)) { if (w.length > 3) { words.push(w,); } }
  const name = words.slice(0, 3,).join(" ",);
  return name.charAt(0,).toUpperCase() + name.slice(1,);
}
