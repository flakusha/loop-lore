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
   */
  async createSkill(input: CreateSkillInput,): Promise<Skill> {
    return createSkillDispatch(this.db, input,);
  }

  /**
   * Get a skill by ID
   * @param skillId
   */
  async getSkill(skillId: string,): Promise<Skill | null> {
    return getSkillDispatch(this.db, skillId,);
  }

  /**
   * Get all skills for an actor
   * @param actorId
   * @param worldId
   */
  async getActorSkills(actorId: string, worldId?: string,): Promise<Skill[]> {
    return getActorSkillsDispatch(this.db, actorId, worldId,);
  }

  /**
   * Get skills by category for an actor
   * @param actorId
   * @param category
   * @param worldId
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
   */
  async updateSkill(skillId: string, input: UpdateSkillInput,): Promise<Skill> {
    return updateSkillDispatch(this.db, skillId, input,);
  }

  /**
   * Delete a skill
   * @param skillId
   */
  async deleteSkill(skillId: string,): Promise<void> {
    return deleteSkillDispatch(this.db, skillId,);
  }

  /**
   * Add XP to a skill
   * @param skillId
   * @param xpAmount
   */
  async addXp(skillId: string, xpAmount: number,): Promise<XpGainResult> {
    return addXpDispatch(this.db, skillId, xpAmount,);
  }

  /**
   * Specialize a skill
   * @param skillId
   * @param specialization
   */
  async specializeSkill(skillId: string, specialization: string,): Promise<Skill> {
    return specializeSkillDispatch(this.db, skillId, specialization,);
  }

  /**
   * Check if a skill meets prerequisites
   * @param actorId
   * @param prerequisites
   * @param worldId
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
   */
  async buildSkillTree(
    actorId: string,
    worldId?: string,
  ): Promise<SkillTreeNode[]> {
    return buildSkillTreeDispatch(this.db, actorId, worldId,);
  }
}
