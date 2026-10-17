// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC memory decay.
 *
 * A sweep walks every unexpired `npc_memories` row, subtracts the elapsed
 * loss from `importance`, and deletes anything that has expired or fallen to
 * zero. Three multipliers stack on top of the row's `decay_rate`:
 *
 *   importance - 100 -> x0.10, 0 -> x1.00 (salient memories fade slowly)
 *   emotional  - abs(impact) 100 -> x0.40, 0 -> x1.00 (affect anchors memory)
 *   shared     - retold to others -> x0.50, otherwise x1.00
 *
 * Loss is `rate x multipliers x days`, where days are counted from
 * `last_reinforced_at` - the clock reinforcement resets, so a re-remembered
 * memory measures elapsed time from its last recall rather than from when it
 * first formed.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { parseExpiryMs, } from "../../utils/date";
import { getRpgLog, } from "../shared/rpg-service-utils";

const MS_PER_DAY = 86_400_000;
/** Floored so an instant elapsed time still decays something. */
const MIN_DECAY_DAYS = 0.01;
/** Share of the base rate retained at maximum importance / emotional impact. */
const IMPORTANCE_FLOOR = 0.1;
const EMOTIONAL_FLOOR = 0.4;
const SHARED_MULTIPLIER = 0.5;

/** The decay inputs, all in row units. */
export interface DecayInputs {
  /** 0..100 */
  importance: number;
  /** -100..100; only the magnitude matters. */
  emotionalImpact: number;
  /** 0 or 1 */
  shared: number;
  /** Importance lost per day before multipliers. */
  decayRate: number;
  /** Whole plus fractional days since the last reinforcement. */
  elapsedDays: number;
}

/** Result of one decay sweep. */
export interface DecaySweepResult {
  /** Rows examined (unexpired at sweep time). */
  swept: number;
  /** Rows whose importance reached 0 and were deleted. */
  forgotten: number;
  /** Rows deleted because `expires_at` had already passed. */
  expired: number;
}

/** Keep a computed importance inside the 0..100 band the column CHECK allows. */
function clampImportance(value: number,): number {
  return Math.max(0, Math.min(100, value,),);
}

/**
 * Total importance lost over `elapsedDays`.
 *
 * Pure - exported so the multiplier table can be asserted directly without
 * touching the database.
 * @param inputs
 * @returns importance points to subtract; never negative.
 */
export function decayLoss(inputs: DecayInputs,): number {
  const importance = Math.max(0, Math.min(100, inputs.importance,),);
  const emotional = Math.min(100, Math.abs(inputs.emotionalImpact,),);
  const importanceMultiplier = 1 - ((1 - IMPORTANCE_FLOOR) * importance) / 100;
  const emotionalMultiplier = 1 - ((1 - EMOTIONAL_FLOOR) * emotional) / 100;
  const sharedMultiplier = inputs.shared === 1 ? SHARED_MULTIPLIER : 1;
  const days = Math.max(MIN_DECAY_DAYS, inputs.elapsedDays,);

  return inputs.decayRate * importanceMultiplier * emotionalMultiplier * sharedMultiplier * days;
}

/**
 * Decay every NPC memory once and forget what has expired or faded out.
 *
 * Deterministic: loss is a closed-form function of the row and the injected
 * `now`, with no RNG and no per-row clock reads.
 * @param db
 * @param now
 * @returns counts of swept / forgotten / expired rows.
 */
export async function decayMemories(db: Kysely<DB>, now: Date,): Promise<DecaySweepResult> {
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  const expired = await db
    .deleteFrom("npc_memories",)
    .where("expires_at", "is not", null,)
    .where("expires_at", "<=", nowIso,)
    .executeTakeFirst();

  const rows = await db
    .selectFrom("npc_memories",)
    .select(["id", "importance", "emotional_impact", "shared", "decay_rate", "last_reinforced_at",],)
    .where((eb,) => eb.or([eb("expires_at", "is", null,), eb("expires_at", ">", nowIso,),],))
    .execute();

  let forgotten = 0;
  for (const row of rows) {
    // SQLite's `datetime('now')` default format (no T, no zone) still parses;
    // an unparseable stamp is measured from the epoch so a malformed row
    // decays fully instead of pinning itself in the store forever.
    const since = parseExpiryMs(row.last_reinforced_at,);
    const elapsedDays = (since === null ? 0 : nowMs - since) / MS_PER_DAY;
    const next = clampImportance(
      row.importance - decayLoss({
        importance: row.importance,
        emotionalImpact: row.emotional_impact,
        shared: row.shared,
        decayRate: row.decay_rate,
        elapsedDays,
      },),
    );

    if (next === 0) {
      await db.deleteFrom("npc_memories",).where("id", "=", row.id,).execute();
      forgotten += 1;
      continue;
    }

    await db.updateTable("npc_memories",).set({ importance: next, },).where("id", "=", row.id,).execute();
  }

  const expiredCount = Number(expired.numDeletedRows,);
  getRpgLog("npc-memory",).debug("Decayed NPC memories", {
    swept: rows.length,
    forgotten,
    expired: expiredCount,
  },);

  return { swept: rows.length, forgotten, expired: expiredCount, };
}
