// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Organic stat growth (FEAT-automatic-organic-stat-growth).
 *
 * On each level gained, a dynamic (`growth_mode='dynamic'`) actor drifts
 * +1 in ONE ability, chosen deterministically by weighting abilities with
 * the XP sources the actor actually earned from (the `xp_ledger` source
 * mix is the activity record). Capped at `ORGANIC_GROWTH_CAP` (18): the
 * last two points of an ability stay reachable only through ASI spend.
 * Static actors never drift — `insertGrowthLog` would refuse the write and
 * this module checks the mode first so the level-up path stays clean.
 *
 * Every applied drift writes a `growth_log` audit row (axis='stat',
 * event 'stat_drifted', before/after JSON) per the epic's contract with
 * epic-character-growth: triggering semantics live here, the log format
 * stays theirs.
 */
import type { Kysely, } from "kysely";
import { characterGrowthService, } from "../../characters/services/growth-service/index.js";
import { GrowthAxis, GrowthEntryStatus, GrowthEventType, } from "../../characters/spec/growth.js";
import type { DB, } from "../../db/schema.js";
import { getLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils.js";
import { updateCharacterStats, } from "../service/character-stats.js";
import { type AbilityName, ALL_ABILITIES, } from "../stats/types.js";

/** Organic drift ceiling — the last points of an ability are ASI-only. */
export const ORGANIC_GROWTH_CAP = 18;

/** XP source → ability the activity trains. Unknown sources train CON. */
const SOURCE_ABILITY: Record<string, AbilityName> = {
  combat: "str",
  quest: "int",
  skill_challenge: "int",
  discovery: "wis",
  travel: "dex",
  nsfw_encounter: "cha",
  nsfw_seduction: "cha",
};

/** Fallback ability for sources with no mapping, and for empty ledgers. */
const DEFAULT_ABILITY: AbilityName = "con";

/** Outcome of one organic-drift application. */
export interface OrganicGrowthResult {
  applied: boolean;
  ability: AbilityName | null;
  before: number | null;
  after: number | null;
  /** Why nothing was applied (`static_mode`, `no_activity`, `all_capped`). */
  reason: string | null;
}

/** Raw stats projection the drift needs. */
interface DriftStatsRow {
  id: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

/**
 * Apply one organic stat-drift point for the actor, if it earns one.
 * Best-effort by contract: a drift failure must not fail the level-up that
 * triggered it, so every error path resolves to `{ applied: false }`.
 * @param db
 * @param actorId
 * @returns {Promise<OrganicGrowthResult>}
 */
export async function applyOrganicGrowth(
  db: Kysely<DB>,
  actorId: string,
): Promise<OrganicGrowthResult> {
  try {
    const growth = characterGrowthService(db,);
    const mode = await growth.getGrowthMode(actorId,);
    if (mode.growthMode === "static") {
      return { applied: false, ability: null, before: null, after: null, reason: "static_mode", };
    }

    const row = await db
      .selectFrom("character_stats",)
      .where("actor_id", "=", actorId,)
      .select(["id", "str", "dex", "con", "int", "wis", "cha",],)
      .executeTakeFirst();

    if (!row) {
      return { applied: false, ability: null, before: null, after: null, reason: "no_stats_row", };
    }

    const ability = await pickAbility(db, actorId, row,);
    if (!ability) {
      return { applied: false, ability: null, before: null, after: null, reason: "all_capped", };
    }

    const before = row[ability];
    const after = before + 1;
    await updateCharacterStats({ database: db, }, row.id, { [ability]: after, },);
    const beforeJson = safeJsonStringify({ [ability]: before, },);
    const afterJson = safeJsonStringify({ [ability]: after, },);
    await growth.insertGrowthLog({
      actorId,
      axis: GrowthAxis.Stat,
      eventType: GrowthEventType.StatDrifted,
      status: GrowthEntryStatus.Applied,
      subjectKind: "ability",
      subjectId: ability,
      beforeJson: beforeJson.ok ? beforeJson.value : null,
      afterJson: afterJson.ok ? afterJson.value : null,
      reason: "organic stat drift from activity mix",
    },);

    return { applied: true, ability, before, after: before + 1, reason: null, };
  } catch (cause) {
    getLogger().child({ module: "rpg-level", },).warn(`Organic growth skipped for ${actorId}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);

    return { applied: false, ability: null, before: null, after: null, reason: "error", };
  }
}

/**
 * Pick the drift target: abilities with ledger activity, weighted by earned
 * XP, capped abilities excluded, canonical order breaks ties. `null` when
 * every ability sits at the cap.
 * @param db
 * @param actorId
 * @param row
 */
async function pickAbility(
  db: Kysely<DB>,
  actorId: string,
  row: DriftStatsRow,
): Promise<AbilityName | null> {
  const weights = new Map<AbilityName, number>(ALL_ABILITIES.map((a,) => [a, 0,]),);
  const mix = await db
    .selectFrom("xp_ledger",)
    .select((eb,) => [
      "source",
      eb.fn.sum<number>("amount",).as("total",),
    ])
    .where("actor_id", "=", actorId,)
    .groupBy("source",)
    .execute();

  for (const entry of mix) {
    const ability = SOURCE_ABILITY[entry.source] ?? DEFAULT_ABILITY;
    weights.set(ability, (weights.get(ability,) ?? 0) + Number(entry.total ?? 0,),);
  }

  // No recognisable activity: drift the fallback ability (CON) — organic
  // growth tracks living, not optimisation.
  const anyActivity = Array.from(weights.values(),).some((w,) => w > 0);
  if (!anyActivity) {
    return row[DEFAULT_ABILITY] < ORGANIC_GROWTH_CAP ? DEFAULT_ABILITY : null;
  }

  // Highest weighted uncapped ability; canonical order breaks ties (the
  // first uncapped candidate is the baseline, heavier weights override).
  let best: AbilityName | null = null;
  let bestWeight = 0;
  for (const ability of ALL_ABILITIES) {
    if (row[ability] >= ORGANIC_GROWTH_CAP) { continue; }
    const weight = weights.get(ability,) ?? 0;
    if (best === null || weight > bestWeight) {
      best = ability;
      bestWeight = weight;
    }
  }

  return best;
}
