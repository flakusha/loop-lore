import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { getActorSkills, } from "./crud";
import type { SkillTreeNode, } from "./types";

/**
 * Check if a skill meets prerequisites
 */
export async function checkPrerequisites(
  db: Kysely<DB>,
  actorId: string,
  prerequisites: string[],
  worldId?: string,
): Promise<{ met: boolean; missing: string[] }> {
  if (prerequisites.length === 0) {
    return { met: true, missing: [], };
  }

  const actorSkills = await getActorSkills(db, actorId, worldId,);
  const actorSkillIds = new Set(Array.from(actorSkills, (s,) => s.id,),);

  const missing: string[] = [];
  for (const id of prerequisites) { if (!actorSkillIds.has(id,)) { missing.push(id,); } }

  return {
    met: missing.length === 0,
    missing,
  };
}

/**
 * Build skill tree for an actor
 */
export async function buildSkillTree(
  db: Kysely<DB>,
  actorId: string,
  worldId?: string,
): Promise<SkillTreeNode[]> {
  const skills = await getActorSkills(db, actorId, worldId,);

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

    const prerequisites = skill.prerequisites;

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
