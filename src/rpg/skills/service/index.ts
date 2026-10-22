// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Skills Service
 *
 * Manages character skills, progression, mastery, and specialization.
 * Skills improve through use and can be specialized for enhanced effects.
 *
 * The concrete logic lives in isolated dispatcher modules (crud, progression,
 * tree, helpers) threaded with an explicit `db` handle. `SkillsService`
 * remains a class so its methods stay on the prototype.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import {
  createSkill as createSkillDispatch,
  deleteSkill as deleteSkillDispatch,
  getActorSkills as getActorSkillsDispatch,
  getSkill as getSkillDispatch,
  getSkillsByCategory as getSkillsByCategoryDispatch,
  updateSkill as updateSkillDispatch,
} from "./crud";
import {
  addXp as addXpDispatch,
  specializeSkill as specializeSkillDispatch,
} from "./progression";
import {
  buildSkillTree as buildSkillTreeDispatch,
  checkPrerequisites as checkPrerequisitesDispatch,
} from "./tree";

import type {
  CreateSkillInput,
  Skill,
  SkillCategory,
  SkillTreeNode,
  UpdateSkillInput,
  XpGainResult,
} from "./types";

export type {
  CreateSkillInput,
  Skill,
  SkillTreeNode,
  UpdateSkillInput,
  XpGainResult,
} from "./types";
export { ProficiencyLevel, SkillCategory, } from "./types";

/**
 * Skills Service
 */
export class SkillsService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Create a new skill for an actor
   * @param input
   * @returns the stored skill
   */
  async createSkill(input: CreateSkillInput,): Promise<Skill> {
    return createSkillDispatch(this.db, input,);
  }

  /**
   * Get a skill by ID
   * @param skillId
   * @returns the skill, or null when no such ID exists
   */
  async getSkill(skillId: string,): Promise<Skill | null> {
    return getSkillDispatch(this.db, skillId,);
  }

  /**
   * Get all skills for an actor
   * @param actorId
   * @param worldId
   * @returns the actor's skills, world-scoped when one is given
   */
  async getActorSkills(actorId: string, worldId?: string,): Promise<Skill[]> {
    return getActorSkillsDispatch(this.db, actorId, worldId,);
  }

  /**
   * Get skills by category for an actor
   * @param actorId
   * @param category
   * @param worldId
   * @returns the actor's skills in that one category
   */
  async getSkillsByCategory(
    actorId: string,
    category: SkillCategory,
    worldId?: string,
  ): Promise<Skill[]> {
    return getSkillsByCategoryDispatch(this.db, actorId, category, worldId,);
  }

  /**
   * Update a skill
   * @param skillId
   * @param input
   * @returns the skill as reloaded after the update
   */
  async updateSkill(skillId: string, input: UpdateSkillInput,): Promise<Skill> {
    return updateSkillDispatch(this.db, skillId, input,);
  }

  /**
   * Delete a skill
   * @param skillId
   * @returns nothing; the skill row is removed
   */
  async deleteSkill(skillId: string,): Promise<void> {
    return deleteSkillDispatch(this.db, skillId,);
  }

  /**
   * Add XP to a skill
   * @param skillId
   * @param xpAmount
   * @param opts Optional ledger provenance (`chatId`, `description`).
   * @returns the new XP total and any levels the gain crossed
   */
  // eslint-disable-next-line local/options-object-params -- 3rd param is optional provenance; positional (skillId, amount) is the pre-existing call shape.
  async addXp(
    skillId: string,
    xpAmount: number,
    opts?: { chatId?: string; description?: string },
  ): Promise<XpGainResult> {
    return addXpDispatch(this.db, skillId, xpAmount, opts,);
  }

  /**
   * Specialize a skill
   * @param skillId
   * @param specialization
   * @returns the skill after the specialization is recorded
   */
  async specializeSkill(skillId: string, specialization: string,): Promise<Skill> {
    return specializeSkillDispatch(this.db, skillId, specialization,);
  }

  /**
   * Check if a skill meets prerequisites
   * @param actorId
   * @param prerequisites
   * @param worldId
   * @returns whether every prerequisite is met, and the names of those that are not
   */
  async checkPrerequisites(
    actorId: string,
    prerequisites: string[],
    worldId?: string,
  ): Promise<{ met: boolean; missing: string[] }> {
    return checkPrerequisitesDispatch(this.db, actorId, prerequisites, worldId,);
  }

  /**
   * Build skill tree for an actor
   * @param actorId
   * @param worldId
   * @returns the actor's skills as parent/child nodes
   */
  async buildSkillTree(
    actorId: string,
    worldId?: string,
  ): Promise<SkillTreeNode[]> {
    return buildSkillTreeDispatch(this.db, actorId, worldId,);
  }
}
