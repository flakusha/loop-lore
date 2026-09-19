// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonStringifyOr, uid, } from "../utils";
import { getActiveEffects, } from "./status-effects";

/**
 * Pheromone / chemistry service (TASK-039).
 *
 * Chemistry is a shared `StatusEffect` family (`category: "physical"`,
 * effect ids `arousal` / `aphrodisiac` / `pheromone_*`): NO private
 * chemistry state outside the shared model. Seduction (TASK-034) and
 * Encounter (TASK-036) consume pheromone modifiers by reading the
 * shared store (`getActiveEffects`), never by querying this service.
 * Effect expiry is time-driven via the shared sweep (`nsfw.status-sweep`,
 * `sweepExpiredEffects`) — no parallel timer. Consumables register
 * through the standard `RecipesService` pipeline (tags carry the effect
 * binding); ad-hoc item hooks are rejected. The service hands the LLM
 * structured effect metadata (`describeEffect`), never free-form prose.
 */

/** Known chemistry effect bindings (effect_id → default shape). */
export const CHEMISTRY_EFFECTS = {
  arousal: { magnitude: 1, defaultDurationSeconds: 3600, },
  aphrodisiac: { magnitude: 2, defaultDurationSeconds: 7200, },
  pheromone_allure: { magnitude: 1, defaultDurationSeconds: 3600, },
  pheromone_heat: { magnitude: 2, defaultDurationSeconds: 3600, },
  contraceptive: { magnitude: 0, defaultDurationSeconds: 86400, },
} as const;

export type ChemistryEffectId = keyof typeof CHEMISTRY_EFFECTS;

const KNOWN_IDS = new Set<string>(Object.keys(CHEMISTRY_EFFECTS,),);

/** Structured effect metadata for LLM narration (Open Q7). */
export interface ChemistryEffectMetadata {
  effectId: string;
  magnitude: number;
  expiresAt: string | null;
  source: string;
  dcModifier: number;
  arousalModifier: number;
}

/** */
export class ChemistryService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Apply a chemistry effect as a shared `status_effect` row keyed by
   * `effectId`. Unknown effect ids are rejected (callers use the known
   * family in `CHEMISTRY_EFFECTS`, extended only by new code, never by
   * free-form input).
   * @param targetActorId
   * @param effectId
   * @param durationSeconds - overrides the effect default when given
   * @param magnitude - overrides the effect default when given
   * @param source
   */
  async applyEffect(
    targetActorId: string,
    effectId: string,
    durationSeconds?: number | null,
    magnitude?: number | null,
    source = "chemistry",
  ): Promise<string> {
    if (!KNOWN_IDS.has(effectId,)) {
      throw new Error(`Unknown chemistry effect: ${effectId}`,);
    }
    const known = CHEMISTRY_EFFECTS[effectId as ChemistryEffectId];
    const now = new Date();
    const id = uid();
    await this.db
      .insertInto("status_effect",)
      .values({
        id,
        actor_id: targetActorId,
        effect_id: effectId,
        category: "physical",
        affected_stat: null,
        magnitude: magnitude ?? known.magnitude,
        source,
        source_id: null,
        started_at: now.toISOString(),
        // eslint-disable-next-line no-restricted-syntax -- epoch-ms arithmetic is allowed; toDate() cannot add durations
        expires_at: new Date(
          now.getTime() + (durationSeconds ?? known.defaultDurationSeconds) * 1000,
        ).toISOString(),
        meta: jsonStringifyOr({ family: "chemistry", },),
      },)
      .execute();
    getLogger().child({ module: "chemistry", },)
      .info(`Chemistry effect applied: ${effectId} → ${targetActorId}`,);
    return id;
  }

  /**
   * Structured metadata for one active chemistry row — the LLM
   * narration input (Open Q7). Returns null when the row is missing,
   * expired, or outside the chemistry family.
   * @param targetActorId
   * @param effectId
   */
  async describeEffect(
    targetActorId: string,
    effectId: string,
  ): Promise<ChemistryEffectMetadata | null> {
    const rows = await getActiveEffects(this.db, targetActorId, { effectId, },);
    const row = rows.find((r,) => r.category === "physical");
    if (!row) { return null; }
    return {
      effectId: row.effectId,
      magnitude: row.magnitude,
      expiresAt: row.expiresAt,
      source: row.source,
      dcModifier: row.effectId === "aphrodisiac" ? -10 * row.magnitude : -5 * row.magnitude,
      arousalModifier: row.magnitude,
    };
  }
}
