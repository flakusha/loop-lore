// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { jsonStringifyOr, } from "../../../utils";
import { checkThresholds, suggestRelationshipUpgrade, } from "./levels";
import { getPair, } from "./pairs";
import type {
  ApplyIntimacyActionOpts,
  ApplyIntimacyResult,
  IntimacyHistoryEntry,
} from "./types";

/** Maximum intimacy score. */
const MAX_SCORE = 100;

/** Minimum intimacy score. */
const MIN_SCORE = 0;

/** Maximum history entries kept per pair. */
const MAX_HISTORY = 50;

/**
 * Apply an intimacy action between two characters.
 *
 * Checks:
 * 1. Minimum intimacy requirement
 * 2. Relationship type allowlist (if defined)
 * 3. Consent flag (if action requires it)
 *
 * Updates score, records history, and fires threshold events.
 * @param db
 * @param opts
 */
export async function applyAction(
  db: Kysely<DB>,
  opts: ApplyIntimacyActionOpts,
): Promise<ApplyIntimacyResult> {
  const { database, actorId, targetActorId, worldId, action, context, } = opts;
  const log = getLogger().child({ module: "intimacy", },);

  const pair = await getPair(db, actorId, targetActorId, worldId,);

  // Check minimum intimacy
  if (pair.score < action.minIntimacy) {
    return {
      newScore: pair.score,
      actualDelta: 0,
      applied: false,
      reason: `Intimacy too low: ${pair.score}/${action.minIntimacy}`,
      thresholdsReached: [],
    };
  }

  // Check relationship type allowlist
  if (action.allowedRelationships && action.allowedRelationships.length > 0) {
    const relationship = await database
      .selectFrom("character_relationships",)
      .select("relationship_type",)
      .where("actor_id", "=", actorId,)
      .where("target_actor_id", "=", targetActorId,)
      .executeTakeFirst();

    if (!relationship || !action.allowedRelationships.includes(relationship.relationship_type,)) {
      return {
        newScore: pair.score,
        actualDelta: 0,
        applied: false,
        reason: "Relationship type not allowed for this action",
        thresholdsReached: [],
      };
    }
  }

  // Apply delta with bounds
  const newScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, pair.score + action.delta,),);
  const actualDelta = newScore - pair.score;

  // Record history
  const history: IntimacyHistoryEntry[] = [
    ...pair.actionHistory,
    {
      actionId: action.id,
      actionName: action.name,
      delta: actualDelta,
      timestamp: new Date().toISOString(),
      context,
    },
  ].slice(-MAX_HISTORY,);

  // Check for threshold events
  const thresholdsReached = checkThresholds(pair.score, newScore, pair.unlockedThresholds,);

  // Update unlocked thresholds
  const newUnlocked = [
    ...pair.unlockedThresholds,
    ...Array.from(thresholdsReached, (t,) => t.level,),
  ];

  // Determine suggested relationship upgrade
  const suggestedRelationshipUpgrade = suggestRelationshipUpgrade(newScore,);

  // Persist
  const now = new Date().toISOString();
  await db
    .updateTable("character_intimacy",)
    .set({
      score: newScore,
      action_history: jsonStringifyOr(history,),
      unlocked_thresholds: jsonStringifyOr(newUnlocked,),
      updated_at: now,
    },)
    .where("id", "=", pair.id,)
    .execute();

  log.info(`Intimacy ${actorId}↔${targetActorId}: ${pair.score}→${newScore} (${action.name})`,);

  return {
    newScore,
    actualDelta,
    applied: true,
    thresholdsReached,
    suggestedRelationshipUpgrade,
  };
}

/**
 * Decay intimacy over time (natural drift toward 0).
 * @param db
 * @param actorId
 * @param decayAmount - How much to decay per call (default 1).
 */
export async function decayAll(
  db: Kysely<DB>,
  actorId: string,
  decayAmount = 1,
): Promise<number> {
  const pairs = await db
    .selectFrom("character_intimacy",)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .execute();

  let affected = 0;

  for (const pair of pairs) {
    if (pair.score <= 0) { continue; }

    const newScore = Math.max(MIN_SCORE, pair.score - decayAmount,);
    if (newScore === pair.score) { continue; }

    const now = new Date().toISOString();
    await db
      .updateTable("character_intimacy",)
      .set({ score: newScore, updated_at: now, },)
      .where("id", "=", pair.id,)
      .execute();

    affected++;
  }

  return affected;
}
