// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { jsonStringifyOr, uid, } from "../utils";
import { type ReproductionCapability, Species, } from "./body-systems/enums";
import { BodySystemService, } from "./body-systems/service";
import { rollDice, } from "./dice";
import type { NsfwEncounter, } from "./encounters/service/types";
import { birthChild, } from "./reproduction-birth";
import {
  GESTATION_WEEKS,
  getPregnancy as getPregnancyFromStore,
  getPregnancyMeta as getPregnancyMetaFromStore,
  PREGNANCY_EFFECT,
  type PregnancyStatus,
} from "./reproduction-store";

export type { PregnancyStatus, } from "./reproduction-store";

/**
 * Pregnancy / reproduction service (TASK-038).
 *
 * Reproduction consumes species flags: `ReproductionCapability` lives in
 * `body-systems/enums.ts` (the `character-species.ts` path in the ticket
 * does not exist — the flags consolidated there instead). Non-reproducing
 * species return early WITHOUT a dice roll. Pregnancy rolls are
 * event-driven from `nsfw.encounter_completed` (the encounter
 * `applyOutcomes` fan-out calls `rollFromEncounter`) — never polled on a
 * timer. Complications emit `disease.reproductive_complication` status
 * rows so Disease/poison attach without bespoke wiring. Birth writes
 * parentage through the canonical `character_relationships` model (`family`
 * type, bidirectional pair) — no parallel NSFW relationship store. Human
 * baseline works with no heat requirement (Open Q2).
 */

/** Per-species reproduction flags (human baseline needs no heat). */
const CAPABILITY_BY_SPECIES: Record<string, ReproductionCapability> = {
  [Species.Human]: { canReproduce: true, requiresHeat: false, crossFertile: true, },
  [Species.Elf]: { canReproduce: true, requiresHeat: false, crossFertile: true, },
  [Species.Dwarf]: { canReproduce: true, requiresHeat: false, crossFertile: false, },
  [Species.Orc]: { canReproduce: true, requiresHeat: false, crossFertile: true, },
  [Species.Demon]: { canReproduce: true, requiresHeat: false, crossFertile: true, },
  [Species.Angel]: { canReproduce: true, requiresHeat: false, crossFertile: false, },
  [Species.Beast]: { canReproduce: true, requiresHeat: true, crossFertile: false, },
  [Species.Dragon]: { canReproduce: true, requiresHeat: true, crossFertile: false, },
};

const DEFAULT_CAPABILITY: ReproductionCapability = {
  canReproduce: false,
  requiresHeat: false,
  crossFertile: false,
};

/**
 * Reproduction flags for a species string (open field — unknown species
 * default to non-reproducing).
 * @param species
 */
export function capabilityFor(species: string,): ReproductionCapability {
  return CAPABILITY_BY_SPECIES[species.toLowerCase()] ?? DEFAULT_CAPABILITY;
}

/** Pregnancy record shape (carried in `status_effect` meta) — see reproduction-store. */

const COMPLICATION_EVENT = "disease.reproductive_complication";

/** */
export class ReproductionService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Event-driven pregnancy roll from an `nsfw.encounter_completed`
   * outcome. Returns the pregnancy row id on conception, null otherwise.
   *
   * Gate order (each returns null early): non-reproducing species of the
   * carrier → cross-species without crossFertile on BOTH sides → heat
   * requirement unmet (carrier not in `heat` phase). Only then the d100
   * roll (base 15 + fertilityBoost×10 − contraceptive guard) decides.
   * Species resolve from each actor's heat-cycle row (`getHeatCycle`
   * auto-creates a human baseline) unless explicit overrides are given.
   * @param carrierId - the potentially pregnant actor
   * @param sireId - the other participant
   * @param encounter
   * @param carrierSpecies - override (default: heat-cycle row)
   * @param sireSpecies - override (default: heat-cycle row)
   */
  async rollPregnancy(
    carrierId: string,
    sireId: string,
    encounter: Pick<NsfwEncounter, "id" | "worldId">,
    carrierSpecies?: string,
    sireSpecies?: string,
  ): Promise<string | null> {
    const log = getLogger().child({ module: "reproduction", },);
    const bodies = new BodySystemService(this.db,);
    const carrierRow = await bodies.getHeatCycle(carrierId, carrierSpecies ?? Species.Human,);
    const sireRow = await bodies.getHeatCycle(sireId, sireSpecies ?? Species.Human,);
    const resolvedCarrier = carrierSpecies ?? carrierRow.species;
    const resolvedSire = sireSpecies ?? sireRow.species;
    const carrierCap = capabilityFor(resolvedCarrier,);
    if (!carrierCap.canReproduce) { return null; }
    const sireCap = capabilityFor(resolvedSire,);
    if (
      resolvedCarrier.toLowerCase() !== resolvedSire.toLowerCase() &&
      !(carrierCap.crossFertile && sireCap.crossFertile)
    ) {
      return null;
    }
    if (carrierCap.requiresHeat && carrierRow.currentPhase !== "heat") { return null; }
    // Contraceptive guard: an active contraceptive row blocks conception.
    const guard = await this.db
      .selectFrom("status_effect",)
      .where("actor_id", "=", carrierId,)
      .where("effect_id", "=", "contraceptive",)
      .where("category", "=", "physical",)
      .where((eb,) =>
        eb.or([
          eb("expires_at", "is", null,),
          eb("expires_at", ">", new Date().toISOString(),),
        ],)
      )
      .select("id",)
      .executeTakeFirst();
    if (guard) { return null; }
    // Fertility boost from heat effects (human baseline: 1).
    let fertility = 1;
    try {
      const bodies = new BodySystemService(this.db,);
      fertility = (await bodies.getHeatEffects(carrierId,)).fertilityBoost;
    } catch {
      fertility = 1;
    }
    const dc = 100 - (15 + Math.floor(fertility * 10,));
    const roll = rollDice(100, 1,).rawTotal;
    if (roll < dc) { return null; }
    const now = new Date();
    const id = uid();
    await this.db
      .insertInto("status_effect",)
      .values({
        id,
        actor_id: carrierId,
        effect_id: PREGNANCY_EFFECT,
        category: "pregnancy",
        affected_stat: null,
        magnitude: 0,
        source: "reproduction",
        source_id: encounter.id,
        started_at: now.toISOString(),
        // eslint-disable-next-line no-restricted-syntax -- epoch-ms arithmetic is allowed; toDate() cannot add durations
        expires_at: new Date(now.getTime() + GESTATION_WEEKS * 7 * 86_400_000,).toISOString(),
        meta: jsonStringifyOr({
          sire_id: sireId,
          world_id: encounter.worldId,
          weeks_elapsed: 0,
          gestation_weeks: GESTATION_WEEKS,
        },),
      },)
      .execute();
    log.info(`Pregnancy conceived: carrier ${carrierId} (encounter ${encounter.id})`,);
    return id;
  }

  /**
   * Advance gestation by weeks; emits a `disease.reproductive_complication`
   * row on a d100 complication check (1-in-20) so Disease attaches
   * without bespoke wiring. Returns the updated status.
   * @param characterId - the pregnant actor
   * @param weeks
   */
  async advanceGestation(characterId: string, weeks = 1,): Promise<PregnancyStatus> {
    const status = await getPregnancyFromStore(this.db, characterId,);
    if (!status.pregnant) { return status; }
    const next = status.weeksElapsed + weeks;
    const log = getLogger().child({ module: "reproduction", },);
    const complication = rollDice(100, 1,).rawTotal;
    if (complication <= 5) {
      await this.db
        .insertInto("status_effect",)
        .values({
          id: uid(),
          actor_id: characterId,
          effect_id: "reproductive_complication",
          category: "disease",
          affected_stat: null,
          magnitude: 1,
          source: "disease",
          source_id: COMPLICATION_EVENT,
          started_at: new Date().toISOString(),
          expires_at: null,
          meta: jsonStringifyOr({ event: COMPLICATION_EVENT, week: next, },),
        },)
        .execute();
      log.warn("Reproductive complication emitted", { actor: characterId, week: next, },);
    }
    await this.db
      .updateTable("status_effect",)
      .set({
        magnitude: next,
        meta: jsonStringifyOr({
          sire_id: (await getPregnancyMetaFromStore(this.db, characterId,)).sireId,
          weeks_elapsed: next,
          gestation_weeks: status.gestationWeeks,
        },),
      },)
      .where("actor_id", "=", characterId,)
      .where("effect_id", "=", PREGNANCY_EFFECT,)
      .where("category", "=", "pregnancy",)
      .execute();
    return { ...status, weeksElapsed: next, };
  }

  /**
   * Birth: removes the pregnancy row, creates the child actor, and
   * writes bidirectional `family` relationships (carrier→child,
   * child→carrier, sire→child when known) through the canonical
   * `character_relationships` model. Returns the child actor id, or null
   * when no active pregnancy exists.
   * @param characterId - the pregnant actor (carrier)
   * @param childName
   */
  async birth(characterId: string, childName: string,): Promise<string | null> {
    return birthChild(this.db, characterId, childName,);
  }

  /**
   * Current pregnancy status for an actor (null-safe: not pregnant when
   * no active row).
   * @param characterId
   */
  async getPregnancy(characterId: string,): Promise<PregnancyStatus> {
    return getPregnancyFromStore(this.db, characterId,);
  }
}
