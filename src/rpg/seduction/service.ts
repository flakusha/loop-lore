/**
 * Seduction Service
 *
 * Manages desire profiles, seduction skills, and arousal states:
 * - Desire profiles (turn-ons, turn-offs, fetishes, hard limits)
 * - Seduction skills that improve with practice
 * - Arousal state tracking with decay
 * - Seduction attempts with skill checks
 *
 * Integrates with the Intimacy system for relationship context.
 */
import type { Kysely, } from "kysely";
import type {
  SeductionSkillCategory,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { uid, } from "../../utils";

// ── Constants ──────────────────────────────────────────────

/** Maximum skill level. */
const MAX_SKILL_LEVEL = 100;

/** XP required per skill level (scales quadratically). */
function xpForLevel(level: number,): number {
  return Math.floor(50 * level * (1 + level * 0.1),);
}

// ── Types ──────────────────────────────────────────────────

/** Desire profile — what a character finds attractive. */
export interface DesireProfile {
  id: string;
  actorId: string;
  turnOns: string[];
  turnOffs: string[];
  fetishes: string[];
  hardLimits: string[];
  currentDesire: number;
  desireDecayRate: number;
  desireBuildupRate: number;
  createdAt: string;
  updatedAt: string;
}

/** A seduction skill level. */
export interface SeductionSkill {
  id: string;
  actorId: string;
  category: SeductionSkillCategory;
  name: string;
  level: number;
  xp: number;
  xpToNext: number;
  createdAt: string;
  updatedAt: string;
}

/** Arousal state for a character. */
export interface ArousalState {
  id: string;
  actorId: string;
  worldId: string | null;
  level: number;
  buildupRate: number;
  decayRate: number;
  modifiers: ArousalModifier[];
  lastUpdate: string;
  createdAt: string;
  updatedAt: string;
}

/** A modifier affecting arousal. */
export interface ArousalModifier {
  source: string;
  multiplier: number;
  duration: number;
  remainingTurns: number;
}

/** Result of a seduction attempt. */
export interface SeductionResult {
  /** Whether the seduction succeeded. */
  success: boolean;
  /** Skill check roll (0–100). */
  roll: number;
  /** Difficulty class (0–100). */
  dc: number;
  /** Arousal change for target. */
  arousalDelta: number;
  /** Intimacy change. */
  intimacyDelta: number;
  /** Skill XP gained. */
  xpGained: number;
  /** Narrative description. */
  description: string;
  /** Whether a hard limit was triggered. */
  hardLimitTriggered: boolean;
}

/** Options for a seduction attempt. */
export interface SeductionAttemptOpts {
  database: Kysely<DB>;
  /** Actor performing the seduction. */
  actorId: string;
  /** Target of the seduction. */
  targetId: string;
  /** Skill category used. */
  skillCategory: SeductionSkillCategory;
  /** Description of the approach. */
  approach: string;
  /** Optional world context. */
  worldId?: string | null;
}

// ── Service ────────────────────────────────────────────────

export class SeductionService {
  constructor(private readonly db: Kysely<DB>,) {}

  // ── Desire Profiles ───────────────────────────────────

  /**
   * Get or create a desire profile for an actor.
   */
  async getDesireProfile(actorId: string,): Promise<DesireProfile> {
    const row = await this.db
      .selectFrom("character_desire_profile",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .executeTakeFirst();

    if (row) {
      return this.rowToDesireProfile(row,);
    }

    // Create default profile
    const now = new Date().toISOString();
    const id = uid();

    await this.db
      .insertInto("character_desire_profile",)
      .values({
        id,
        actor_id: actorId,
        turn_ons: "[]",
        turn_offs: "[]",
        fetishes: "[]",
        hard_limits: "[]",
        current_desire: 0,
        desire_decay_rate: 1,
        desire_buildup_rate: 1,
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return {
      id,
      actorId,
      turnOns: [],
      turnOffs: [],
      fetishes: [],
      hardLimits: [],
      currentDesire: 0,
      desireDecayRate: 1,
      desireBuildupRate: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Update a desire profile.
   */
  async updateDesireProfile(
    actorId: string,
    updates: Partial<
      Pick<DesireProfile, "turnOns" | "turnOffs" | "fetishes" | "hardLimits" | "desireDecayRate" | "desireBuildupRate">
    >,
  ): Promise<boolean> {
    // Ensure profile exists
    await this.getDesireProfile(actorId,);

    const now = new Date().toISOString();
    const clause: Record<string, unknown> = { updated_at: now, };

    if (updates.turnOns !== undefined) { clause.turn_ons = JSON.stringify(updates.turnOns,); }
    if (updates.turnOffs !== undefined) { clause.turn_offs = JSON.stringify(updates.turnOffs,); }
    if (updates.fetishes !== undefined) { clause.fetishes = JSON.stringify(updates.fetishes,); }
    if (updates.hardLimits !== undefined) { clause.hard_limits = JSON.stringify(updates.hardLimits,); }
    if (updates.desireDecayRate !== undefined) { clause.desire_decay_rate = updates.desireDecayRate; }
    if (updates.desireBuildupRate !== undefined) { clause.desire_buildup_rate = updates.desireBuildupRate; }

    const result = await this.db
      .updateTable("character_desire_profile",)
      .set(clause,)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();

    return (result.numUpdatedRows ?? 0n) > 0n;
  }

  // ── Seduction Skills ──────────────────────────────────

  /**
   * Get or create a seduction skill for an actor.
   */
  async getSkill(
    actorId: string,
    category: SeductionSkillCategory,
    name: string,
  ): Promise<SeductionSkill> {
    const row = await this.db
      .selectFrom("character_seduction_skills",)
      .where("actor_id", "=", actorId,)
      .where("skill_category", "=", category,)
      .where("skill_name", "=", name,)
      .selectAll()
      .executeTakeFirst();

    if (row) {
      return this.rowToSkill(row,);
    }

    // Create level 1 skill
    const now = new Date().toISOString();
    const id = uid();

    await this.db
      .insertInto("character_seduction_skills",)
      .values({
        id,
        actor_id: actorId,
        skill_category: category,
        skill_name: name,
        level: 1,
        xp: 0,
        xp_to_next: xpForLevel(1,),
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return {
      id,
      actorId,
      category,
      name,
      level: 1,
      xp: 0,
      xpToNext: xpForLevel(1,),
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Award XP to a seduction skill and level up if threshold reached.
   */
  async awardXp(
    actorId: string,
    category: SeductionSkillCategory,
    name: string,
    amount: number,
  ): Promise<{ leveled: boolean; newLevel: number }> {
    const skill = await this.getSkill(actorId, category, name,);
    const newXp = skill.xp + amount;

    if (newXp < skill.xpToNext) {
      // No level up — just update XP
      const now = new Date().toISOString();
      await this.db
        .updateTable("character_seduction_skills",)
        .set({ xp: newXp, updated_at: now, },)
        .where("id", "=", skill.id,)
        .execute();

      return { leveled: false, newLevel: skill.level, };
    }

    // Level up
    const newLevel = Math.min(MAX_SKILL_LEVEL, skill.level + 1,);
    const overflowXp = newXp - skill.xpToNext;
    const now = new Date().toISOString();

    await this.db
      .updateTable("character_seduction_skills",)
      .set({
        level: newLevel,
        xp: overflowXp,
        xp_to_next: xpForLevel(newLevel,),
        updated_at: now,
      },)
      .where("id", "=", skill.id,)
      .execute();

    const log = getLogger().child({ module: "seduction", },);
    log.info(`Seduction skill ${name} leveled up: ${skill.level}→${newLevel}`,);

    return { leveled: true, newLevel, };
  }

  /**
   * Get all seduction skills for an actor.
   */
  async getActorSkills(actorId: string,): Promise<SeductionSkill[]> {
    const rows = await this.db
      .selectFrom("character_seduction_skills",)
      .where("actor_id", "=", actorId,)
      .orderBy("skill_category", "asc",)
      .orderBy("skill_name", "asc",)
      .selectAll()
      .execute();

    return rows.map((r,) => this.rowToSkill(r,));
  }

  // ── Arousal State ─────────────────────────────────────

  /**
   * Get or create arousal state for an actor.
   */
  async getArousal(
    actorId: string,
    worldId: string | null = null,
  ): Promise<ArousalState> {
    const row = await this.db
      .selectFrom("character_arousal",)
      .where("actor_id", "=", actorId,)
      .where("world_id", "is", worldId,)
      .selectAll()
      .executeTakeFirst();

    if (row) {
      return this.rowToArousal(row,);
    }

    // Create default state
    const now = new Date().toISOString();
    const id = uid();

    await this.db
      .insertInto("character_arousal",)
      .values({
        id,
        actor_id: actorId,
        world_id: worldId,
        level: 0,
        buildup_rate: 1,
        decay_rate: 1,
        modifiers: "[]",
        last_update: now,
        created_at: now,
        updated_at: now,
      },)
      .execute();

    return {
      id,
      actorId,
      worldId,
      level: 0,
      buildupRate: 1,
      decayRate: 1,
      modifiers: [],
      lastUpdate: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Modify arousal level for an actor.
   *
   * @param delta - Arousal change (positive = increase, negative = decrease).
   * @returns New arousal level.
   */
  async modifyArousal(
    actorId: string,
    delta: number,
    worldId: string | null = null,
    source?: string,
  ): Promise<number> {
    const state = await this.getArousal(actorId, worldId,);

    // Apply modifiers
    let modifiedDelta = delta * state.buildupRate;
    for (const mod of state.modifiers) {
      modifiedDelta *= mod.multiplier;
    }

    const newLevel = Math.max(0, Math.min(100, state.level + modifiedDelta,),);

    const now = new Date().toISOString();
    await this.db
      .updateTable("character_arousal",)
      .set({
        level: newLevel,
        last_update: now,
        updated_at: now,
      },)
      .where("id", "=", state.id,)
      .execute();

    if (source) {
      const log = getLogger().child({ module: "seduction", },);
      log.info(`Arousal ${actorId}: ${state.level}→${newLevel} (${source})`,);
    }

    return newLevel;
  }

  /**
   * Decay arousal over time.
   */
  async decayArousal(actorId: string, worldId: string | null = null,): Promise<number> {
    const state = await this.getArousal(actorId, worldId,);
    if (state.level <= 0) { return 0; }

    const decay = state.level * state.decayRate * 0.1;
    const newLevel = Math.max(0, state.level - decay,);

    const now = new Date().toISOString();
    await this.db
      .updateTable("character_arousal",)
      .set({
        level: newLevel,
        last_update: now,
        updated_at: now,
      },)
      .where("id", "=", state.id,)
      .execute();

    return newLevel;
  }

  /**
   * Add a modifier to arousal state.
   */
  async addModifier(
    actorId: string,
    modifier: Omit<ArousalModifier, "remainingTurns"> & { duration: number },
    worldId: string | null = null,
  ): Promise<void> {
    const state = await this.getArousal(actorId, worldId,);

    const newMod: ArousalModifier = {
      ...modifier,
      remainingTurns: modifier.duration,
    };

    const mods = [...state.modifiers, newMod,];

    const now = new Date().toISOString();
    await this.db
      .updateTable("character_arousal",)
      .set({
        modifiers: JSON.stringify(mods,),
        updated_at: now,
      },)
      .where("id", "=", state.id,)
      .execute();
  }

  // ── Seduction Attempts ────────────────────────────────

  /**
   * Attempt a seduction action.
   *
   * Skill check: roll 1d100 vs DC.
   * DC is influenced by target's arousal, turn-ons, and hard limits.
   */
  async attemptSeduction(opts: SeductionAttemptOpts,): Promise<SeductionResult> {
    const { actorId, targetId, skillCategory, approach, worldId, } = opts;
    const log = getLogger().child({ module: "seduction", },);

    // Check hard limits first
    const targetProfile = await this.getDesireProfile(targetId,);
    const approachLower = approach.toLowerCase();
    const hardLimitTriggered = targetProfile.hardLimits.some(
      (limit,) => approachLower.includes(limit.toLowerCase(),),
    );

    if (hardLimitTriggered) {
      log.info(`Seduction blocked: hard limit triggered for ${targetId}`,);
      return {
        success: false,
        roll: 0,
        dc: 100,
        arousalDelta: -10,
        intimacyDelta: -5,
        xpGained: 0,
        description: "Hard limit triggered — seduction rejected.",
        hardLimitTriggered: true,
      };
    }

    // Get actor's skill (category-based, use first matching)
    const skills = await this.getActorSkills(actorId,);
    const relevantSkill = skills.find((s,) => s.category === skillCategory);
    const skillLevel = relevantSkill?.level ?? 1;

    // Calculate DC based on target's state
    const targetArousal = await this.getArousal(targetId, worldId,);
    const targetDesire = await this.getDesireProfile(targetId,);

    // Base DC 50, modified by target's arousal and desire
    let dc = 50;
    dc -= Math.floor(targetArousal.level * 0.3,); // Arousal makes them easier
    dc -= Math.floor(targetDesire.currentDesire * 0.2,); // Desire makes them easier

    // Turn-ons reduce DC
    const turnOnMatch = targetDesire.turnOns.some(
      (on,) => approachLower.includes(on.toLowerCase(),),
    );
    if (turnOnMatch) { dc -= 15; }

    // Turn-offs increase DC
    const turnOffMatch = targetDesire.turnOffs.some(
      (off,) => approachLower.includes(off.toLowerCase(),),
    );
    if (turnOffMatch) { dc += 15; }

    dc = Math.max(10, Math.min(90, dc,),);

    // Roll: skill level contributes to roll
    const roll = Math.floor(Math.random() * 50,) + Math.floor(skillLevel / 2,);
    const success = roll >= dc;

    // Calculate deltas
    const arousalDelta = success ? Math.floor(10 + skillLevel * 0.3,) : -5;
    const intimacyDelta = success ? Math.floor(3 + skillLevel * 0.1,) : -2;
    const xpGained = success ? 15 + Math.floor(dc / 5,) : 5;

    // Apply arousal change to target
    if (arousalDelta !== 0) {
      await this.modifyArousal(targetId, arousalDelta, worldId, `seduction:${skillCategory}`,);
    }

    // Award XP
    if (relevantSkill) {
      await this.awardXp(actorId, skillCategory, relevantSkill.name, xpGained,);
    }

    // Build description
    const description = success
      ? `Seduction successful! ${approach} resonated with the target.`
      : `Seduction failed. ${approach} didn't land as intended.`;

    log.info(
      `Seduction ${actorId}→${targetId}: ${success ? "success" : "failure"} (roll=${roll}, dc=${dc})`,
    );

    return {
      success,
      roll,
      dc,
      arousalDelta,
      intimacyDelta,
      xpGained,
      description,
      hardLimitTriggered: false,
    };
  }

  // ── Private helpers ───────────────────────────────────

  private rowToDesireProfile(row: {
    id: string;
    actor_id: string;
    turn_ons: string;
    turn_offs: string;
    fetishes: string;
    hard_limits: string;
    current_desire: number;
    desire_decay_rate: number;
    desire_buildup_rate: number;
    created_at: string;
    updated_at: string;
  },): DesireProfile {
    return {
      id: row.id,
      actorId: row.actor_id,
      turnOns: JSON.parse(row.turn_ons,) as string[],
      turnOffs: JSON.parse(row.turn_offs,) as string[],
      fetishes: JSON.parse(row.fetishes,) as string[],
      hardLimits: JSON.parse(row.hard_limits,) as string[],
      currentDesire: row.current_desire,
      desireDecayRate: row.desire_decay_rate,
      desireBuildupRate: row.desire_buildup_rate,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToSkill(row: {
    id: string;
    actor_id: string;
    skill_category: SeductionSkillCategory;
    skill_name: string;
    level: number;
    xp: number;
    xp_to_next: number;
    created_at: string;
    updated_at: string;
  },): SeductionSkill {
    return {
      id: row.id,
      actorId: row.actor_id,
      category: row.skill_category,
      name: row.skill_name,
      level: row.level,
      xp: row.xp,
      xpToNext: row.xp_to_next,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToArousal(row: {
    id: string;
    actor_id: string;
    world_id: string | null;
    level: number;
    buildup_rate: number;
    decay_rate: number;
    modifiers: string;
    last_update: string;
    created_at: string;
    updated_at: string;
  },): ArousalState {
    return {
      id: row.id,
      actorId: row.actor_id,
      worldId: row.world_id,
      level: row.level,
      buildupRate: row.buildup_rate,
      decayRate: row.decay_rate,
      modifiers: JSON.parse(row.modifiers,) as ArousalModifier[],
      lastUpdate: row.last_update,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
