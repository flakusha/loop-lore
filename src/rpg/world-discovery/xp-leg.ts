// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Discovery XP leg (FEAT-xp-sources).
 *
 * A first-time location discovery pays the discovering actor a flat award
 * through the shared LevelService pipeline. Best-effort like every reward
 * leg: charting must not fail because bookkeeping did. The (actor,
 * `discovery`, world:location) ledger key is idempotent on its own, so even
 * a replay that re-emits the event cannot double-pay.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";
import { getLogger, } from "../../logger";
import { awardXpToActor, } from "../level/index.js";
import { xpForDiscovery, } from "../xp/sources.js";

/**
 * Grant the first-discovery XP award to an actor.
 * @param db
 * @param actorId
 * @param worldId
 * @param locationId
 * @returns {Promise<void>}
 */
export async function applyDiscoveryXpLeg(
  db: Kysely<DB>,
  actorId: string,
  worldId: string,
  locationId: string,
): Promise<void> {
  try {
    await awardXpToActor(db, {
      actorId,
      amount: xpForDiscovery(),
      source: "discovery",
      referenceId: `${worldId}:${locationId}`,
      description: `Discovered location ${locationId}`,
    },);
  } catch (cause) {
    getLogger().child({ module: "world-discovery", },).warn(`Discovery XP skipped for ${actorId}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}
