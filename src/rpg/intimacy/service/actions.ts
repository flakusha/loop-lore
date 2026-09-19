// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { assertNsfwCapability, } from "../../../nsfw/capability-gate";
import { getModifier, } from "../../stats/modifiers";
import { checkThresholds, suggestRelationshipUpgrade, } from "./levels";
import { getPair, } from "./pairs";
import { getActorStatBlock, logLevelChangeMood, persistPairScore, } from "./persist";
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

  // NSFW capability gate (TASK-033): rating + consent + intimacy floor.
  // Throws CapabilityBlockedError on denial — bypassing it is a violation.
  // The gate's intimacy floor uses the pre-action score; non-consensual
  // progression is a violation path (trauma), not intimacy gain (Open Q1).
  if (opts.gate) {
    try {
      await assertNsfwCapability({
        database,
        config: opts.gate.config,
        userId: opts.gate.userId,
        chatId: opts.gate.chatId,
        actorId,
        targetActorId,
        worldId: worldId ?? null,
        contentRating: opts.gate.contentRating,
        ratingLimits: opts.gate.ratingLimits,
        consentAction: opts.gate.consentAction,
      },);
    } catch (cause) {
      // Violation path (TASK-044): gate denial escalates trauma on the
      // target actor (best-effort — a missing row must not mask the
      // denial), then the denial propagates unchanged.
      try {
        const { TraumaService, } = await import("../../trauma");
        await new TraumaService(database,).escalateViolation(
          targetActorId ?? actorId,
          opts.gate.chatId ?? undefined,
        );
      } catch (escalation) {
        log.warn(`Trauma escalation skipped for ${targetActorId ?? actorId}:`, {
          error: escalation instanceof Error ? escalation.message : String(escalation,),
        },);
      }
      throw cause;
    }
  }

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

  // Apply delta scaled by the actor's social presence (CHA helps build,
  // WIS tempers loss) — TASK-033: encounter rolls consult CHA/WIS stats.
  const stats = await getActorStatBlock(db, actorId,);
  const chaMod = getModifier(stats, "cha",);
  const wisMod = getModifier(stats, "wis",);
  const socialMod = action.delta >= 0 ? chaMod : Math.min(0, wisMod,);
  const scaledDelta = action.delta + socialMod;
  const newScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, pair.score + scaledDelta,),);
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

  const upward = newScore > pair.score;
  const feltBy = upward ? [targetActorId,] : [targetActorId, actorId,];
  await logLevelChangeMood({
    db,
    log,
    pairId: pair.id,
    actorId,
    feltIds: feltBy,
    upward,
    worldId,
    thresholds: thresholdsReached,
  },);

  await persistPairScore({ db, pairId: pair.id, score: newScore, history, unlocked: newUnlocked, },);

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
