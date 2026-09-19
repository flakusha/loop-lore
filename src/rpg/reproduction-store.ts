// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { jsonParseOr, } from "../utils";

/** Pregnancy record shape (carried in `status_effect` meta). */
export interface PregnancyStatus {
  pregnant: boolean;
  effectId: string | null;
  weeksElapsed: number;
  gestationWeeks: number;
  sireId: string | null;
  expiresAt: string | null;
}

/** Raw meta carrier (sire + week counters) for the active row. */
export interface PregnancyMeta {
  sireId: string | null;
  weeksElapsed: number;
  gestationWeeks: number;
}

export const GESTATION_WEEKS = 40;
export const PREGNANCY_EFFECT = "pregnancy";

/**
 * Current pregnancy status for an actor (null-safe: not pregnant when
 * no active row).
 * @param db
 * @param characterId
 */
export async function getPregnancy(
  db: Kysely<DB>,
  characterId: string,
): Promise<PregnancyStatus> {
  const empty: PregnancyStatus = {
    pregnant: false,
    effectId: null,
    weeksElapsed: 0,
    gestationWeeks: GESTATION_WEEKS,
    sireId: null,
    expiresAt: null,
  };
  const row = await db
    .selectFrom("status_effect",)
    .where("actor_id", "=", characterId,)
    .where("effect_id", "=", PREGNANCY_EFFECT,)
    .where("category", "=", "pregnancy",)
    .selectAll()
    .executeTakeFirst();
  if (!row) { return empty; }
  if (row.expires_at !== null && row.expires_at <= new Date().toISOString()) { return empty; }
  const meta = await getPregnancyMeta(db, characterId,);
  return {
    pregnant: true,
    effectId: row.id,
    weeksElapsed: meta.weeksElapsed,
    gestationWeeks: meta.gestationWeeks,
    sireId: meta.sireId,
    expiresAt: row.expires_at,
  };
}

/**
 * Raw meta carrier (sire + week counters) for the active row.
 * @param db
 * @param characterId
 */
export async function getPregnancyMeta(
  db: Kysely<DB>,
  characterId: string,
): Promise<PregnancyMeta> {
  const fallback: PregnancyMeta = { sireId: null, weeksElapsed: 0, gestationWeeks: GESTATION_WEEKS, };
  const row = await db
    .selectFrom("status_effect",)
    .where("actor_id", "=", characterId,)
    .where("effect_id", "=", PREGNANCY_EFFECT,)
    .where("category", "=", "pregnancy",)
    .select("meta",)
    .executeTakeFirst();
  if (!row?.meta) { return fallback; }
  const parsed = jsonParseOr(row.meta, {} as {
    sire_id?: unknown;
    weeks_elapsed?: unknown;
    gestation_weeks?: unknown;
  },);
  return {
    sireId: typeof parsed.sire_id === "string" ? parsed.sire_id : null,
    weeksElapsed: typeof parsed.weeks_elapsed === "number" ? parsed.weeks_elapsed : 0,
    gestationWeeks: typeof parsed.gestation_weeks === "number" ? parsed.gestation_weeks : GESTATION_WEEKS,
  };
}
