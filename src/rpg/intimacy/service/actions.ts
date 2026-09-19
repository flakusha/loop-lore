// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { MoodService, } from "../../../characters/services/mood-service";
import { IntimacyActionType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import {
  assertNsfwCapability,
  CapabilityBlockedError,
} from "../../../nsfw/capability-gate";
import { getModifier, } from "../../stats/modifiers";
import type { StatBlock, } from "../../stats/types";
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

/** Default ability scores when no character_stats row exists (mods of 0). */
const DEFAULT_STATS: StatBlock = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, };

/** Happiness delta applied to the target on a cross-tier transition. */
const TIER_MOOD_DELTA = 3;

/**
 * Load an actor's ability scores from `character_stats`, defaulting to all-10
 * when the row is missing.
 * @param db
 * @param actorId
 */
async function getActorStatBlock(db: Kysely<DB>, actorId: string,): Promise<StatBlock> {
  const row = await db
    .selectFrom("character_stats",)
    .select(["str", "dex", "con", "int", "wis", "cha",],)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();
  if (!row) { return { ...DEFAULT_STATS, }; }
  return {
    str: row.str,
    dex: row.dex,
    con: row.con,
    int: row.int,
    wis: row.wis,
    cha: row.cha,
  };
}

/** Logger type carried into helpers (avoids repeating getLogger wiring). */
type ModuleLog = ReturnType<typeof getLogger>;

/**
 * Log one source-tagged mood event per cross-tier transition.
 *
 * `checkThresholds` is already once-per-crossing, so each emitted event is
 * `intimacy.level_changed` surfaced through Character Core (TASK-041).
 * Best-effort: a missing mood row must not fail the intimacy update.
 * @param args
 */
async function logLevelChangeMood(args: {
  db: Kysely<DB>;
  log: ModuleLog;
  pairId: string;
  actorId: string;
  feltIds: string[];
  upward: boolean;
  worldId?: string | null;
  thresholds: { level: number }[];
},): Promise<void> {
  const { db, log, pairId, feltIds, upward, worldId, thresholds, } = args;
  if (thresholds.length === 0) { return; }
  const mood = MoodService(db,);
  for (const feltId of feltIds) {
    for (const threshold of thresholds) {
      try {
        await mood.logEvent({
          actorId: feltId,
          worldId: worldId ?? undefined,
          eventType: "intimacy.level_changed",
          happinessDelta: upward ? TIER_MOOD_DELTA : -TIER_MOOD_DELTA,
          source: "intimacy",
          sourceId: `${pairId}:${threshold.level}`,
        },);
      } catch (cause) {
        log.warn(`Mood follow-through skipped for ${feltId}:`, cause instanceof Error ? cause : undefined,);
      }
    }
  }
}

/**
 * Persist the pair score, history, and unlocked thresholds.
 * @param args
 */
async function persistPairScore(args: {
  db: Kysely<DB>;
  pairId: string;
  score: number;
  history: IntimacyHistoryEntry[];
  unlocked: number[];
},): Promise<void> {
  const { db, pairId, score, history, unlocked, } = args;
  await db
    .updateTable("character_intimacy",)
    .set({
      score,
      action_history: jsonStringifyOr(history,),
      unlocked_thresholds: jsonStringifyOr(unlocked,),
      updated_at: new Date().toISOString(),
    },)
    .where("id", "=", pairId,)
    .execute();
}

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
  await logLevelChangeMood({ db, log, pairId: pair.id, actorId, feltIds: feltBy, upward, worldId, thresholds: thresholdsReached, },);

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
