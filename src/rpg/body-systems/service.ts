/**
 * Body System Service
 *
 * Manages physical attributes affecting NSFW interactions:
 * - Physique (stamina, flexibility, sensitivity, endurance)
 * - Size/build classification
 * - Body modifications (piercings, tattoos, etc.)
 * - Heat cycles for species with reproductive cycles
 *
 * Body profile affects arousal buildup, encounter duration, and available actions.
 */
import type { Kysely, } from "kysely";
import type {
  BodyBuild,
  HeatPhase,
  SizeCategory,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
import { nowAndId, parseJsonField, } from "../shared/rpg-service-utils";

// ── Types ──────────────────────────────────────────────────

/** Physical attributes of a character. */
export interface BodyProfile {
  id: string;
  actorId: string;
  stamina: number;
  flexibility: number;
  sensitivity: number;
  endurance: number;
  sizeCategory: SizeCategory;
  build: BodyBuild;
  beauty: number;
  charisma: number;
  style: number;
  scent: string | null;
  modifications: BodyModification[];
  createdAt: string;
  updatedAt: string;
}

/** A body modification (piercing, tattoo, etc.). */
export interface BodyModification {
  type: "piercing" | "tattoo" | "implant" | "marking" | "scar";
  location: string;
  visibility: "hidden" | "partial" | "visible";
  attractivenessModifier: number;
  intimidationModifier: number;
  fetishAppeal: string[];
}

/** Heat cycle state for species with reproductive cycles. */
export interface HeatCycleState {
  id: string;
  actorId: string;
  species: string;
  cycleLengthDays: number;
  currentPhase: HeatPhase;
  daysUntilNextHeat: number;
  effects: HeatEffects;
  createdAt: string;
  updatedAt: string;
}

/** Mechanical effects during heat. */
export interface HeatEffects {
  arousalMultiplier: number;
  seductionResistance: number;
  pheromoneEmission: number;
  fertilityBoost: number;
  moodInstability: number;
  desireIntensity: number;
}

/** Options for updating a body profile. */
export interface UpdateBodyProfileOpts {
  stamina?: number;
  flexibility?: number;
  sensitivity?: number;
  endurance?: number;
  sizeCategory?: SizeCategory;
  build?: BodyBuild;
  beauty?: number;
  charisma?: number;
  style?: number;
  scent?: string | null;
}

// ── Service ────────────────────────────────────────────────

export class BodySystemService {
  constructor(private readonly db: Kysely<DB>,) {}

  // ── Body Profile ──────────────────────────────────────

  /**
   * Get or create a body profile for an actor.
   */
  async getProfile(actorId: string,): Promise<BodyProfile> {
    const row = await this.db
      .selectFrom("character_body_profile",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .executeTakeFirst();

    if (row) {
      return this.rowToProfile(row,);
    }

    // Create default profile
    const { id, now, } = nowAndId();

    await this.db
      .insertInto("character_body_profile",)
      .values({
        id,
        actor_id: actorId,
        stamina: 50,
        flexibility: 50,
        sensitivity: 50,
        endurance: 50,
        size_category: "average",
        build: "average",
        beauty: 50,
        charisma: 50,
        style: 50,
        scent: null,
        modifications: "[]",
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return {
      id,
      actorId,
      stamina: 50,
      flexibility: 50,
      sensitivity: 50,
      endurance: 50,
      sizeCategory: "average",
      build: "average",
      beauty: 50,
      charisma: 50,
      style: 50,
      scent: null,
      modifications: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Update a body profile.
   */
  async updateProfile(
    actorId: string,
    updates: UpdateBodyProfileOpts,
  ): Promise<boolean> {
    // Ensure profile exists
    await this.getProfile(actorId,);

    const now = new Date().toISOString();
    const fields: Record<string, unknown> = { updated_at: now, };

    if (updates.stamina !== undefined) { fields.stamina = clamp(updates.stamina,); }
    if (updates.flexibility !== undefined) { fields.flexibility = clamp(updates.flexibility,); }
    if (updates.sensitivity !== undefined) { fields.sensitivity = clamp(updates.sensitivity,); }
    if (updates.endurance !== undefined) { fields.endurance = clamp(updates.endurance,); }
    if (updates.sizeCategory !== undefined) { fields.size_category = updates.sizeCategory; }
    if (updates.build !== undefined) { fields.build = updates.build; }
    if (updates.beauty !== undefined) { fields.beauty = clamp(updates.beauty,); }
    if (updates.charisma !== undefined) { fields.charisma = clamp(updates.charisma,); }
    if (updates.style !== undefined) { fields.style = clamp(updates.style,); }
    if (updates.scent !== undefined) { fields.scent = updates.scent; }

    const result = await this.db
      .updateTable("character_body_profile",)
      .set(fields,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();

    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  /**
   * Add a body modification.
   */
  async addModification(
    actorId: string,
    modification: BodyModification,
  ): Promise<void> {
    const profile = await this.getProfile(actorId,);
    const mods = [...profile.modifications, modification,];

    const now = new Date().toISOString();
    await this.db
      .updateTable("character_body_profile",)
      .set({
        modifications: safeJsonStringify(mods,).value ?? "[]",
        updated_at: now,
      },)
      .where("actor_id", "=", actorId,)
      .execute();
  }

  /**
   * Remove a body modification by index.
   */
  async removeModification(actorId: string, index: number,): Promise<boolean> {
    const profile = await this.getProfile(actorId,);
    if (index < 0 || index >= profile.modifications.length) { return false; }

    const mods: BodyModification[] = [];
    for (let i = 0; i < profile.modifications.length; i++) {
      if (i !== index) { mods.push(profile.modifications[i]!,); }
    }

    const now = new Date().toISOString();
    await this.db
      .updateTable("character_body_profile",)
      .set({
        modifications: safeJsonStringify(mods,).value ?? "[]",
        updated_at: now,
      },)
      .where("actor_id", "=", actorId,)
      .execute();

    return true;
  }

  // ── Heat Cycle ────────────────────────────────────────
  private defaultEffects: HeatEffects = {
    arousalMultiplier: 1,
    seductionResistance: 1,
    pheromoneEmission: 0,
    fertilityBoost: 1,
    moodInstability: 0,
    desireIntensity: 1,
  };

  /**
   * Get or create a heat cycle for an actor.
   */
  async getHeatCycle(
    actorId: string,
    species = "human",
  ): Promise<HeatCycleState> {
    const row = await this.db
      .selectFrom("character_heat_cycle",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .executeTakeFirst();

    if (row) {
      return this.rowToHeatCycle(row,);
    }

    // Create default cycle (no heat for humans)
    const { id, now, } = nowAndId();
    const isHuman = species.toLowerCase() === "human";

    const effectsStringify = safeJsonStringify(this.defaultEffects, 2,);
    const effects = effectsStringify.ok ? effectsStringify.value : "{}";

    await this.db
      .insertInto("character_heat_cycle",)
      .values({
        id,
        actor_id: actorId,
        species,
        cycle_length_days: isHuman ? 0 : 30,
        current_phase: "normal",
        days_until_next_heat: isHuman ? 0 : 30,
        effects,
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return {
      id,
      actorId,
      species,
      cycleLengthDays: isHuman ? 0 : 30,
      currentPhase: "normal",
      daysUntilNextHeat: isHuman ? 0 : 30,
      effects: this.defaultEffects,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Advance the heat cycle by a number of days.
   */
  async advanceHeatCycle(
    actorId: string,
    days: number,
  ): Promise<{ newPhase: HeatPhase; daysUntilNext: number }> {
    const cycle = await this.getHeatCycle(actorId,);
    if (cycle.cycleLengthDays === 0) {
      return { newPhase: "normal", daysUntilNext: 0, };
    }

    let remaining = cycle.daysUntilNextHeat - days;
    let newPhase = cycle.currentPhase;

    // Phase transitions
    if (remaining <= 0) {
      // Cycle completes — advance phase
      const phaseOrder: HeatPhase[] = ["normal", "pre_heat", "heat", "post_heat",];
      const currentIdx = phaseOrder.indexOf(cycle.currentPhase,);
      const nextIdx = (currentIdx + 1) % phaseOrder.length;
      newPhase = phaseOrder[nextIdx]!;

      // Reset remaining days for new phase
      remaining = newPhase === "heat"
        ? Math.floor(cycle.cycleLengthDays * 0.25,)
        : Math.floor(cycle.cycleLengthDays * 0.25,);
    }

    const now = new Date().toISOString();
    await this.db
      .updateTable("character_heat_cycle",)
      .set({
        current_phase: newPhase,
        days_until_next_heat: Math.max(0, remaining,),
        updated_at: now,
      },)
      .where("actor_id", "=", actorId,)
      .execute();

    const log = getLogger().child({ module: "body-systems", },);
    log.info(`Heat cycle ${actorId}: ${cycle.currentPhase}→${newPhase} (${days} days)`,);

    return { newPhase, daysUntilNext: Math.max(0, remaining,), };
  }

  /**
   * Get the current heat effects for an actor.
   * Returns nullified effects for non-heat species.
   */
  async getHeatEffects(actorId: string,): Promise<HeatEffects> {
    const cycle = await this.getHeatCycle(actorId,);
    if (cycle.currentPhase !== "heat") {
      return {
        arousalMultiplier: 1,
        seductionResistance: 1,
        pheromoneEmission: 0,
        fertilityBoost: 1,
        moodInstability: 0,
        desireIntensity: 1,
      };
    }
    return cycle.effects;
  }

  // ── Derived Stats ─────────────────────────────────────

  /**
   * Calculate effective encounter duration based on stamina + endurance.
   */
  static calculateEncounterDuration(profile: BodyProfile,): number {
    return Math.floor((profile.stamina + profile.endurance) / 10,);
  }

  /**
   * Calculate available positions/actions based on flexibility + build.
   */
  static calculateAvailableActions(profile: BodyProfile,): number {
    const base = Math.floor(profile.flexibility / 10,);
    let buildBonus: number;
    switch (profile.build) {
      case "athletic": {
        buildBonus = 2;
        break;
      }
      case "slim": {
        buildBonus = 1;
        break;
      }
      case "heavy": {
        buildBonus = -1;
        break;
      }
      default: {
        buildBonus = 0;
      }
    }
    return Math.max(1, base + buildBonus,);
  }

  /**
   * Calculate arousal buildup modifier from sensitivity + body.
   */
  static calculateArousalModifier(profile: BodyProfile,): number {
    return 0.5 + (profile.sensitivity / 100) * 1.5;
  }

  // ── Private helpers ───────────────────────────────────

  private rowToProfile(row: {
    id: string;
    actor_id: string;
    stamina: number;
    flexibility: number;
    sensitivity: number;
    endurance: number;
    size_category: SizeCategory;
    build: BodyBuild;
    beauty: number;
    charisma: number;
    style: number;
    scent: string | null;
    modifications: string;
    created_at: string;
    updated_at: string;
  },): BodyProfile {
    const modifications = parseJsonField<BodyModification[]>(row.modifications, [],);

    return {
      id: row.id,
      actorId: row.actor_id,
      stamina: row.stamina,
      flexibility: row.flexibility,
      sensitivity: row.sensitivity,
      endurance: row.endurance,
      sizeCategory: row.size_category,
      build: row.build,
      beauty: row.beauty,
      charisma: row.charisma,
      style: row.style,
      scent: row.scent,
      modifications,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToHeatCycle(row: {
    id: string;
    actor_id: string;
    species: string;
    cycle_length_days: number;
    current_phase: HeatPhase;
    days_until_next_heat: number;
    effects: string;
    created_at: string;
    updated_at: string;
  },): HeatCycleState {
    const effects = parseJsonField<HeatEffects>(row.effects, this.defaultEffects,);

    return {
      id: row.id,
      actorId: row.actor_id,
      species: row.species,
      cycleLengthDays: row.cycle_length_days,
      currentPhase: row.current_phase,
      daysUntilNextHeat: row.days_until_next_heat,
      effects,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ── Helpers ────────────────────────────────────────────────

/** Clamp a value to 1–100 range. */
function clamp(value: number,): number {
  return Math.max(1, Math.min(100, value,),);
}
