/**
 * Skills Service Tests
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import { ProficiencyLevel, SkillCategory, SkillsService, } from "./service";

describe("SkillsService", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };
  let service: SkillsService;
  let actorId: string;

  beforeAll(async () => {
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    actorId = "actor-skills-1";
    await insertActors(db, "Skills Tester", { id: actorId, } as never,);
    service = new SkillsService(db,);
  },);

  afterAll(() => {
    sqlite.close();
  },);

  describe("enum values", () => {
    it("should have correct category values", () => {
      expect(SkillCategory.Combat,).toBe("combat",);
      expect(SkillCategory.Magic,).toBe("magic",);
      expect(SkillCategory.Crafting,).toBe("crafting",);
      expect(SkillCategory.Social,).toBe("social",);
      expect(SkillCategory.Exploration,).toBe("exploration",);
      expect(SkillCategory.Survival,).toBe("survival",);
      expect(SkillCategory.Knowledge,).toBe("knowledge",);
      expect(SkillCategory.Stealth,).toBe("stealth",);
    });

    it("should have correct proficiency values", () => {
      expect(ProficiencyLevel.Novice,).toBe("novice",);
      expect(ProficiencyLevel.Apprentice,).toBe("apprentice",);
      expect(ProficiencyLevel.Journeyman,).toBe("journeyman",);
      expect(ProficiencyLevel.Expert,).toBe("expert",);
      expect(ProficiencyLevel.Master,).toBe("master",);
      expect(ProficiencyLevel.Grandmaster,).toBe("grandmaster",);
    });
  });

  describe("DB round-trip", () => {
    it("creates, reads, and levels up a skill", async () => {
      const skill = await service.createSkill({
        actorId,
        name: "Swordplay",
        category: SkillCategory.Combat,
        description: "Melee weapon proficiency",
      },);

      expect(skill.id,).toBeTruthy();
      expect(skill.name,).toBe("Swordplay",);
      expect(skill.category,).toBe(SkillCategory.Combat,);
      expect(skill.level,).toBe(1,);
      expect(skill.proficiency,).toBe(ProficiencyLevel.Novice,);
      expect(skill.isLocked,).toBe(false,);

      const fetched = await service.getSkill(skill.id,);
      expect(fetched,).not.toBeNull();
      expect(fetched!.name,).toBe("Swordplay",);

      const actorSkills = await service.getActorSkills(actorId,);
      expect(actorSkills.some((s,) => s.id === skill.id),).toBe(true,);

      const xp = await service.addXp(skill.id, 150,);
      expect(xp.totalXp,).toBe(150,);
      expect(xp.newLevel,).toBeGreaterThan(1,);
      expect(xp.newProficiency,).toBe(ProficiencyLevel.Apprentice,);

      // Update + specialize round-trip
      const updated = await service.updateSkill(skill.id, { description: "Expert swordsman", },);
      expect(updated.description,).toBe("Expert swordsman",);

      await service.deleteSkill(skill.id,);
      expect(await service.getSkill(skill.id,),).toBeNull();
    });

    it("builds a skill tree from prerequisites", async () => {
      const base = await service.createSkill({ actorId, name: "Combat Basics", category: SkillCategory.Combat, },);
      const advanced = await service.createSkill({
        actorId,
        name: "Advanced Combat",
        category: SkillCategory.Combat,
        prerequisites: [base.id,],
      },);

      const tree = await service.buildSkillTree(actorId,);
      const baseNode = tree.find((n,) => n.skillId === base.id);
      expect(baseNode,).toBeDefined();
      expect(baseNode!.children.some((c,) => c.skillId === advanced.id),).toBe(true,);

      const prereq = await service.checkPrerequisites(actorId, [base.id,],);
      expect(prereq.met,).toBe(true,);

      await service.deleteSkill(base.id,);
      await service.deleteSkill(advanced.id,);
    });
  });
});
