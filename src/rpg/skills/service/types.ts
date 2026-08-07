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
