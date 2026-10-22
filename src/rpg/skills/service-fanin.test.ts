/**
 * Skills XP fan-in tests — guard + shared ledger + skill level-up audit.
 *
 * Pins the epic-character-xp-leveling contract for
 * `SkillsService.addXp`: LevelService-shaped guard (`invalid_amount`,
 * `Invalid XP amount ...` prefix, integers only — no fractional skill XP
 * exists in any caller); one shared `xp_ledger` row (actor = skill owner,
 * source `skill_usage`, reference = [skillId, amount]) so repeat awards
 * with the same reference replay without double-writing skill XP; one
 * `growth_log` row per skill level gained (axis='skill', event
 * `skill_leveled_up`); static-mode actors still gain XP with no audit row;
 * and skill XP never touches `character_stats` (no fan-out).
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import { encodeReferencePair, } from "../xp/sources";
import { SkillCategory, SkillsService, } from "./service";

describe("SkillsService skill-XP fan-in", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };
  let service: SkillsService;
  let actorId: string;

  beforeAll(async () => {
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    actorId = "actor-skills-fanin";
    await insertActors(db, "FanIn Tester", { id: actorId, } as never,);
    service = new SkillsService(db,);
  },);

  afterAll(() => {
    sqlite.close();
  },);

  async function ledgerRows(skillId: string, amount: number,) {
    return db.selectFrom("xp_ledger",).selectAll()
      .where("actor_id", "=", actorId,)
      .where("source", "=", "skill_usage",)
      .where("reference_id", "=", encodeReferencePair(skillId, amount,),)
      .execute();
  }

  async function skillAuditRows(skillId: string,) {
    const rows = await db.selectFrom("growth_log",).selectAll()
      .where("actor_id", "=", actorId,)
      .where("axis", "=", "skill",)
      .where("event_type", "=", "skill_leveled_up",)
      .execute();

    return rows.filter((r,) => r.subject_id === skillId);
  }

  it("rejects invalid amounts with the LevelService shape", async () => {
    const skill = await service.createSkill({ actorId, name: "FanIn Guard", category: SkillCategory.Combat, },);

    await expect(service.addXp(skill.id, -50,),).rejects.toThrow("Invalid XP amount",);
    await expect(service.addXp(skill.id, Number.NaN,),).rejects.toThrow("Invalid XP amount",);
    await expect(service.addXp(skill.id, Number.POSITIVE_INFINITY,),).rejects.toThrow("Invalid XP amount",);
    await expect(service.addXp(skill.id, 1.5,),).rejects.toThrow("Invalid XP amount",);
    await expect(service.addXp(skill.id, "50" as unknown as number,),).rejects.toThrow("Invalid XP amount",);

    try {
      await service.addXp(skill.id, -1,);
      expect.unreachable("negative XP should reject",);
    } catch (error) {
      expect((error as { code?: string }).code,).toBe("invalid_amount",);
    }

    const after = await service.getSkill(skill.id,);
    expect(after!.xp,).toBe(0,);
    expect(after!.level,).toBe(1,);
    expect(await ledgerRows(skill.id, -50,),).toHaveLength(0,);

    await service.deleteSkill(skill.id,);
  });

  it("writes a shared ledger row with the skill_usage source", async () => {
    const skill = await service.createSkill({ actorId, name: "FanIn Ledger", category: SkillCategory.Combat, },);

    const result = await service.addXp(skill.id, 50,);
    expect(result.leveledUp,).toBe(true,);
    expect(result.newLevel,).toBe(2,);

    const rows = await ledgerRows(skill.id, 50,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0]!.amount,).toBe(50,);
    expect(rows[0]!.description,).toBe("Skill XP: FanIn Ledger",);

    const custom = await service.createSkill({ actorId, name: "FanIn Provenance", category: SkillCategory.Combat, },);
    await service.addXp(custom.id, 10, { chatId: "chat-1", description: "Drill practice", },);
    const customRows = await db.selectFrom("xp_ledger",).selectAll()
      .where("actor_id", "=", actorId,)
      .where("source", "=", "skill_usage",)
      .where("reference_id", "=", encodeReferencePair(custom.id, 10,),)
      .execute();

    expect(customRows,).toHaveLength(1,);
    expect(customRows[0]!.description,).toBe("Drill practice",);
    expect(customRows[0]!.chat_id,).toBe("chat-1",);

    await service.deleteSkill(skill.id,);
    await service.deleteSkill(custom.id,);
  });

  it("re-award with the same reference does not double-write skill XP", async () => {
    const skill = await service.createSkill({ actorId, name: "FanIn Idem", category: SkillCategory.Combat, },);

    const first = await service.addXp(skill.id, 50,);
    expect(first.xpGained,).toBe(50,);
    expect(first.totalXp,).toBe(50,);

    const second = await service.addXp(skill.id, 50,);
    expect(second.xpGained,).toBe(0,);
    expect(second.totalXp,).toBe(50,);
    expect(second.leveledUp,).toBe(false,);

    const after = await service.getSkill(skill.id,);
    expect(after!.xp,).toBe(50,);
    expect(after!.level,).toBe(2,);
    expect(await ledgerRows(skill.id, 50,),).toHaveLength(1,);

    await service.deleteSkill(skill.id,);
  });

  it("audits one growth_log row per skill level gained", async () => {
    const skill = await service.createSkill({ actorId, name: "FanIn Audit", category: SkillCategory.Combat, },);

    const result = await service.addXp(skill.id, 200,);
    expect(result.leveledUp,).toBe(true,);
    expect(result.newLevel,).toBe(3,);

    const auditRows = await skillAuditRows(skill.id,);
    const levels = auditRows
      .map((row,) => ({
        before: JSON.parse(row.before_json!,) as { level: number },
        after: JSON.parse(row.after_json!,) as { level: number },
      }))
      .sort((first, second,) => first.after.level - second.after.level);

    expect(levels,).toEqual([
      { before: { level: 1, }, after: { level: 2, }, },
      { before: { level: 2, }, after: { level: 3, }, },
    ],);

    await service.deleteSkill(skill.id,);
  });

  it("static-mode actor still gains skill XP with no audit row", async () => {
    const frozenId = await insertActors(db, "Frozen Skiller", { growth_mode: "static", },);
    const frozen = new SkillsService(db,);
    const skill = await frozen.createSkill({
      actorId: frozenId,
      name: "Frozen Blade",
      category: SkillCategory.Combat,
    },);

    const result = await frozen.addXp(skill.id, 50,);
    expect(result.leveledUp,).toBe(true,);
    expect((await frozen.getSkill(skill.id,))!.xp,).toBe(50,);

    const rows = await db.selectFrom("growth_log",).selectAll()
      .where("actor_id", "=", frozenId,)
      .execute();

    expect(rows,).toHaveLength(0,);

    await frozen.deleteSkill(skill.id,);
  });

  it("skill XP never touches character_stats", async () => {
    const skill = await service.createSkill({ actorId, name: "FanIn NoFanout", category: SkillCategory.Combat, },);

    await service.addXp(skill.id, 200,);

    const stats = await db.selectFrom("character_stats",).selectAll()
      .where("actor_id", "=", actorId,)
      .execute();

    expect(stats,).toHaveLength(0,);

    await service.deleteSkill(skill.id,);
  });

  it("proficiency change still lands on the stored skill row", async () => {
    const skill = await service.createSkill({ actorId, name: "FanIn Prof", category: SkillCategory.Combat, },);

    const result = await service.addXp(skill.id, 150,);
    expect(result.newProficiency,).toBe("apprentice",);
    expect((await service.getSkill(skill.id,))!.proficiency,).toBe("apprentice",);

    await service.deleteSkill(skill.id,);
  });
});
