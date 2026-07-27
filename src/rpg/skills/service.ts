/**
 * Skills Service
 *
 * Manages character skills, progression, mastery, and specialization.
 * Skills improve through use and can be specialized for enhanced effects.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import { getLogger, } from "../../logger";

function getLog() {
  return getLogger().child({ module: "skills", },);
}

/** Skill categories */
export const SkillCategory = {
  Combat: "combat",
  Magic: "magic",
  Crafting: "crafting",
  Social: "social",
  Exploration: "exploration",
  Survival: "survival",
  Knowledge: "knowledge",
  Stealth: "stealth",
} as const;
export type SkillCategory = (typeof SkillCategory)[keyof typeof SkillCategory];

/** Skill proficiency levels */
export const ProficiencyLevel = {
  Novice: "novice",
  Apprentice: "apprentice",
  Journeyman: "journeyman",
  Expert: "expert",
  Master: "master",
  Grandmaster: "grandmaster",
} as const;
export type ProficiencyLevel = (typeof ProficiencyLevel)[keyof typeof ProficiencyLevel];

/** XP thresholds for each proficiency level */
const PROFICIENCY_THRESHOLDS: Record<ProficiencyLevel, number> = {
  [ProficiencyLevel.Novice]: 0,
  [ProficiencyLevel.Apprentice]: 100,
  [ProficiencyLevel.Journeyman]: 300,
  [ProficiencyLevel.Expert]: 600,
  [ProficiencyLevel.Master]: 1000,
  [ProficiencyLevel.Grandmaster]: 1500,
};

/** Skill definition */
export interface Skill {
  id: string;
  actorId: string;
  worldId: string | null;
  name: string;
  category: SkillCategory;
  description: string | null;
  level: number;
  xp: number;
  proficiency: ProficiencyLevel;
  specialization: string | null;
  isLocked: boolean;
  prerequisites: string[]; // skill IDs
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Skill creation input */
export interface CreateSkillInput {
  actorId: string;
  worldId?: string;
  name: string;
  category: SkillCategory;
  description?: string;
  prerequisites?: string[];
  metadata?: Record<string, unknown>;
}

/** Skill update input */
export interface UpdateSkillInput {
  name?: string;
  description?: string;
  category?: SkillCategory;
  specialization?: string | null;
  metadata?: Record<string, unknown>;
}

/** Skill XP gain result */
export interface XpGainResult {
  skillId: string;
  xpGained: number;
  totalXp: number;
  newLevel: number;
  newProficiency: ProficiencyLevel;
  leveledUp: boolean;
  proficiencyChanged: boolean;
}

/** Skill tree node */
export interface SkillTreeNode {
  skillId: string;
  name: string;
  category: SkillCategory;
  level: number;
  proficiency: ProficiencyLevel;
  isUnlocked: boolean;
  isSpecialized: boolean;
  children: SkillTreeNode[];
}

/** Skills Service */
export class SkillsService {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Create a new skill for an actor
   */
  async createSkill(input: CreateSkillInput,): Promise<Skill> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const skillData = {
      id,
      actor_id: input.actorId,
      world_id: input.worldId ?? null,
      name: input.name,
      category: input.category,
      description: input.description ?? null,
      level: 1,
      xp: 0,
      proficiency: ProficiencyLevel.Novice,
      specialization: null,
      is_locked: false,
      prerequisites: JSON.stringify(input.prerequisites ?? [],),
      metadata: JSON.stringify(input.metadata ?? {},),
      created_at: now,
      updated_at: now,
    };

    await this.db.insertInto("character_skills" as any,).values(skillData,).execute();

    getLog().info("Skill created", { id, actorId: input.actorId, name: input.name, },);

    return this.rowToSkill(skillData,);
  }

  /**
   * Get a skill by ID
   */
  async getSkill(skillId: string,): Promise<Skill | null> {
    const row = await (this.db as any)
      .selectFrom("character_skills",)
      .where("id", "=", skillId,)
      .selectAll()
      .executeTakeFirst();

    return row ? this.rowToSkill(row,) : null;
  }

  /**
   * Get all skills for an actor
   */
  async getActorSkills(actorId: string, worldId?: string,): Promise<Skill[]> {
    let query = (this.db as any)
      .selectFrom("character_skills",)
      .where("actor_id", "=", actorId,)
      .orderBy("category", "asc",)
      .orderBy("name", "asc",);

    if (worldId) {
      query = query.where("world_id", "=", worldId,);
    }

    const rows = await query.selectAll().execute();
    return rows.map((row: any,) => this.rowToSkill(row,));
  }

  /**
   * Get skills by category for an actor
   */
  async getSkillsByCategory(
    actorId: string,
    category: SkillCategory,
    worldId?: string,
  ): Promise<Skill[]> {
    let query = (this.db as any)
      .selectFrom("character_skills",)
      .where("actor_id", "=", actorId,)
      .where("category", "=", category,)
      .orderBy("level", "desc",);

    if (worldId) {
      query = query.where("world_id", "=", worldId,);
    }

    const rows = await query.selectAll().execute();
    return rows.map((row: any,) => this.rowToSkill(row,));
  }

  /**
   * Update a skill
   */
  async updateSkill(skillId: string, input: UpdateSkillInput,): Promise<Skill> {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      updated_at: now,
    };

    if (input.name !== undefined) { updates.name = input.name; }
    if (input.description !== undefined) { updates.description = input.description; }
    if (input.category !== undefined) { updates.category = input.category; }
    if (input.specialization !== undefined) { updates.specialization = input.specialization; }
    if (input.metadata !== undefined) { updates.metadata = JSON.stringify(input.metadata,); }

    await (this.db as any)
      .updateTable("character_skills",)
      .set(updates,)
      .where("id", "=", skillId,)
      .execute();

    return (await this.getSkill(skillId,))!;
  }

  /**
   * Delete a skill
   */
  async deleteSkill(skillId: string,): Promise<void> {
    await (this.db as any)
      .deleteFrom("character_skills",)
      .where("id", "=", skillId,)
      .execute();
  }

  /**
   * Add XP to a skill
   */
  async addXp(skillId: string, xpAmount: number,): Promise<XpGainResult> {
    const skill = await this.getSkill(skillId,);
    if (!skill) { throw new Error("Skill not found",); }

    const oldLevel = skill.level;
    const oldProficiency = skill.proficiency;
    const newXp = skill.xp + xpAmount;
    const newLevel = this.calculateLevel(newXp,);
    const newProficiency = this.calculateProficiency(newXp,);

    const leveledUp = newLevel > oldLevel;
    const proficiencyChanged = newProficiency !== oldProficiency;

    await (this.db as any)
      .updateTable("character_skills",)
      .set({
        xp: newXp,
        level: newLevel,
        proficiency: newProficiency,
        updated_at: new Date().toISOString(),
      },)
      .where("id", "=", skillId,)
      .execute();

    if (leveledUp) {
      getLog().info("Skill leveled up", {
        skillId,
        name: skill.name,
        oldLevel,
        newLevel,
      },);
    }

    if (proficiencyChanged) {
      getLog().info("Skill proficiency changed", {
        skillId,
        name: skill.name,
        oldProficiency,
        newProficiency,
      },);
    }

    return {
      skillId,
      xpGained: xpAmount,
      totalXp: newXp,
      newLevel,
      newProficiency,
      leveledUp,
      proficiencyChanged,
    };
  }

  /**
   * Specialize a skill
   */
  async specializeSkill(skillId: string, specialization: string,): Promise<Skill> {
    const skill = await this.getSkill(skillId,);
    if (!skill) { throw new Error("Skill not found",); }

    if (
      skill.proficiency !== ProficiencyLevel.Expert &&
      skill.proficiency !== ProficiencyLevel.Master &&
      skill.proficiency !== ProficiencyLevel.Grandmaster
    ) {
      throw new Error("Skill must be at least Expert level to specialize",);
    }

    await (this.db as any)
      .updateTable("character_skills",)
      .set({
        specialization,
        updated_at: new Date().toISOString(),
      },)
      .where("id", "=", skillId,)
      .execute();

    getLog().info("Skill specialized", { skillId, name: skill.name, specialization, },);

    return (await this.getSkill(skillId,))!;
  }

  /**
   * Check if a skill meets prerequisites
   */
  async checkPrerequisites(
    actorId: string,
    prerequisites: string[],
    worldId?: string,
  ): Promise<{ met: boolean; missing: string[] }> {
    if (prerequisites.length === 0) {
      return { met: true, missing: [], };
    }

    const actorSkills = await this.getActorSkills(actorId, worldId,);
    const actorSkillIds = new Set(actorSkills.map((s,) => s.id),);

    const missing = prerequisites.filter((id,) => !actorSkillIds.has(id,));

    return {
      met: missing.length === 0,
      missing,
    };
  }

  /**
   * Build skill tree for an actor
   */
  async buildSkillTree(
    actorId: string,
    worldId?: string,
  ): Promise<SkillTreeNode[]> {
    const skills = await this.getActorSkills(actorId, worldId,);

    // Build tree structure
    const nodeMap = new Map<string, SkillTreeNode>();
    const roots: SkillTreeNode[] = [];

    // Create nodes
    for (const skill of skills) {
      nodeMap.set(skill.id, {
        skillId: skill.id,
        name: skill.name,
        category: skill.category,
        level: skill.level,
        proficiency: skill.proficiency,
        isUnlocked: !skill.isLocked,
        isSpecialized: skill.specialization !== null,
        children: [],
      },);
    }

    // Build parent-child relationships
    for (const skill of skills) {
      const node = nodeMap.get(skill.id,);
      if (!node) { continue; }

      const prerequisites = this.parseJsonField<string[]>(skill.prerequisites, [],);

      if (prerequisites.length === 0) {
        roots.push(node,);
      } else {
        for (const parentId of prerequisites) {
          const parent = nodeMap.get(parentId,);
          if (parent) {
            parent.children.push(node,);
          }
        }
      }
    }

    return roots;
  }

  /**
   * Calculate level from XP
   */
  private calculateLevel(xp: number,): number {
    // Simple quadratic scaling: level = sqrt(xp / 50)
    return Math.floor(Math.sqrt(xp / 50,),) + 1;
  }

  /**
   * Calculate proficiency from XP
   */
  private calculateProficiency(xp: number,): ProficiencyLevel {
    if (xp >= PROFICIENCY_THRESHOLDS[ProficiencyLevel.Grandmaster]) {
      return ProficiencyLevel.Grandmaster;
    }
    if (xp >= PROFICIENCY_THRESHOLDS[ProficiencyLevel.Master]) {
      return ProficiencyLevel.Master;
    }
    if (xp >= PROFICIENCY_THRESHOLDS[ProficiencyLevel.Expert]) {
      return ProficiencyLevel.Expert;
    }
    if (xp >= PROFICIENCY_THRESHOLDS[ProficiencyLevel.Journeyman]) {
      return ProficiencyLevel.Journeyman;
    }
    if (xp >= PROFICIENCY_THRESHOLDS[ProficiencyLevel.Apprentice]) {
      return ProficiencyLevel.Apprentice;
    }
    return ProficiencyLevel.Novice;
  }

  /**
   * Parse JSON field safely
   */
  private parseJsonField<T,>(raw: unknown, fallback: T,): T {
    if (typeof raw !== "string") { return fallback; }
    try {
      return JSON.parse(raw,) as T;
    } catch {
      return fallback;
    }
  }

  /**
   * Convert database row to Skill interface
   */
  private rowToSkill(row: any,): Skill {
    return {
      id: row.id,
      actorId: row.actor_id,
      worldId: row.world_id,
      name: row.name,
      category: row.category,
      description: row.description,
      level: row.level,
      xp: row.xp,
      proficiency: row.proficiency,
      specialization: row.specialization,
      isLocked: row.is_locked,
      prerequisites: this.parseJsonField<string[]>(row.prerequisites, [],),
      metadata: this.parseJsonField<Record<string, unknown>>(row.metadata, {},),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
