// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { MoodService, } from "../../../characters/services/mood-service";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { jsonStringifyOr, } from "../../../utils";
import type { StatBlock, } from "../../stats/types";
import type { IntimacyHistoryEntry, } from "./types";

/** Default ability scores when no character_stats row exists (mods of 0). */
export const DEFAULT_STATS: StatBlock = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, };

/** Happiness delta applied to the target on a cross-tier transition. */
export const TIER_MOOD_DELTA = 3;

/**
 * Load an actor's ability scores from `character_stats`, defaulting to all-10
 * when the row is missing.
 * @param db
 * @param actorId
 */
export async function getActorStatBlock(db: Kysely<DB>, actorId: string,): Promise<StatBlock> {
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
export async function logLevelChangeMood(args: {
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
        log.warn(`Mood follow-through skipped for ${feltId}:`, {
          error: cause instanceof Error ? cause.message : String(cause,),
        },);
      }
    }
  }
}

/**
 * Persist the pair score, history, and unlocked thresholds.
 * @param args
 */
export async function persistPairScore(args: {
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
