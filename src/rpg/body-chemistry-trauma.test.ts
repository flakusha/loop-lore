// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertCharacterStats, } from "../test-utils/insert-helpers";
import { BodySystemService, } from "./body-systems/service";
import { ChemistryService, } from "./chemistry";
import { severityFromOutcome, TraumaService, } from "./trauma";

createLogger({ level: "error", },);

/** */
async function seedActor(db: Kysely<DB>, id: string, name: string,): Promise<void> {
  await insertActors(db, name, { id, },);
}

describe("body physical status (TASK-035)", () => {
  test("getPhysicalStatus merges profile with shared rows and CON", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-body", "Body",);
    const bodies = new BodySystemService(db,);
    const chemistry = new ChemistryService(db,);
    // Base capacity 50 stamina; CON 14 → +2 modifier.
    await insertCharacterStats(db, "actor-body", 10, 10, 10, { con: 14, },);
    await chemistry.applyEffect("actor-body", "aphrodisiac", 3600, 2,);
    const status = await bodies.getPhysicalStatus("actor-body",);
    expect(status.profile.stamina,).toBe(50,);
    expect(status.aphrodisiac,).toBe(2,);
    expect(status.exhaustion,).toBe(0,);
    expect(status.effectiveStamina,).toBe(50,);
    // duration = floor((50 + 50) / 10) + conMod(2) = 12.
    expect(status.effectiveDuration,).toBe(12,);
  });

  test("exhaustion rows drain effective stamina", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-tired", "Tired",);
    const bodies = new BodySystemService(db,);
    const chemistry = new ChemistryService(db,);
    await chemistry.applyEffect("actor-tired", "arousal", 3600, 3,);
    const { applyStatusEffect, } = await import("./status-effects");
    await applyStatusEffect(db, {
      actorId: "actor-tired", effectId: "exhaustion", category: "physical",
      magnitude: 20, source: "encounter",
    },);
    const status = await bodies.getPhysicalStatus("actor-tired",);
    expect(status.arousal,).toBe(3,);
    expect(status.exhaustion,).toBe(20,);
    expect(status.effectiveStamina,).toBe(30,);
  });

  test("expired rows are invisible to physical status", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-fresh", "Fresh",);
    const bodies = new BodySystemService(db,);
    const { applyStatusEffect, } = await import("./status-effects");
    await applyStatusEffect(db, {
      actorId: "actor-fresh", effectId: "exhaustion", category: "physical",
      magnitude: 40, source: "test", durationSeconds: -1,
    },);
    const status = await bodies.getPhysicalStatus("actor-fresh",);
    expect(status.exhaustion,).toBe(0,);
    expect(status.effectiveStamina,).toBe(50,);
  });

  test("CON modifier flows through duration (default 0 without stats)", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-nostats", "NoStats",);
    const bodies = new BodySystemService(db,);
    const status = await bodies.getPhysicalStatus("actor-nostats",);
    // floor((50 + 50) / 10) + 0 = 10.
    expect(status.effectiveDuration,).toBe(10,);
    expect(BodySystemService.calculateEncounterDuration(status.profile, 3,),).toBe(13,);
  });
});

describe("chemistry service (TASK-039)", () => {
  test("applyEffect writes a shared physical row", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-chem", "Chem",);
    const chemistry = new ChemistryService(db,);
    const id = await chemistry.applyEffect("actor-chem", "pheromone_allure", 1800, 1,);
    expect(typeof id,).toBe("string",);
    const rows = await db.selectFrom("status_effect",)
      .where("actor_id", "=", "actor-chem",)
      .selectAll()
      .execute();
    expect(rows.length,).toBe(1,);
    expect(rows[0]!.effect_id,).toBe("pheromone_allure",);
    expect(rows[0]!.category,).toBe("physical",);
    expect(rows[0]!.expires_at,).not.toBeNull();
  });

  test("applyEffect rejects unknown effect ids", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-chem2", "Chem2",);
    const chemistry = new ChemistryService(db,);
    await expect(chemistry.applyEffect("actor-chem2", "love_potion_9000", 60, 99,),)
      .rejects.toThrow("Unknown chemistry effect",);
  });

  test("describeEffect returns structured metadata, null when absent", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-meta", "Meta",);
    const chemistry = new ChemistryService(db,);
    expect(await chemistry.describeEffect("actor-meta", "aphrodisiac",),).toBeNull();
    await chemistry.applyEffect("actor-meta", "aphrodisiac", 3600, 2,);
    const meta = await chemistry.describeEffect("actor-meta", "aphrodisiac",);
    expect(meta?.effectId,).toBe("aphrodisiac",);
    expect(meta?.magnitude,).toBe(2,);
    expect(meta?.dcModifier,).toBe(-20,);
    expect(meta?.arousalModifier,).toBe(2,);
    expect(meta?.expiresAt,).not.toBeNull();
  });
});

describe("trauma service (TASK-044)", () => {
  const satisfaction = {
    type: "satisfaction" as const,
    effects: { intimacyChange: 5, moodChange: 5, satisfactionBonus: 5, memoryCreated: false, reputationChange: 0, },
  };
  const dissatisfaction = {
    type: "dissatisfaction" as const,
    effects: { intimacyChange: -2, moodChange: -3, satisfactionBonus: 0, memoryCreated: false, reputationChange: 0, },
  };
  const injury = {
    type: "injury" as const,
    effects: { intimacyChange: -5, moodChange: -10, satisfactionBonus: 0, memoryCreated: false, reputationChange: 0, },
  };

  test("severity derives from outcome shape, non-consensual escalates", () => {
    expect(severityFromOutcome(satisfaction,),).toBe(0,);
    expect(severityFromOutcome(dissatisfaction,),).toBe(1,);
    expect(severityFromOutcome({ ...dissatisfaction, effects: { ...dissatisfaction.effects, moodChange: -8, }, },),).toBe(2,);
    expect(severityFromOutcome(injury,),).toBe(3,);
    expect(severityFromOutcome(injury, true,),).toBe(4,);
    expect(severityFromOutcome(satisfaction, true,),).toBe(1,);
  });

  test("applyTrauma no-ops at 0, writes shared row otherwise", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-trauma", "Trauma",);
    const trauma = new TraumaService(db,);
    expect(await trauma.applyTrauma("actor-trauma", 0,),).toBeNull();
    const id = await trauma.applyTrauma("actor-trauma", 2, "enc-1",);
    expect(typeof id,).toBe("string",);
    const status = await trauma.getStatus("actor-trauma",);
    expect(status.severity,).toBe(2,);
    expect(status.effects[0]!.effectId,).toBe("trauma_sev2",);
  });

  test("escalateViolation steps up from current max, capped at 4", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-viol", "Viol",);
    const trauma = new TraumaService(db,);
    await trauma.escalateViolation("actor-viol",);
    expect((await trauma.getStatus("actor-viol",)).severity,).toBe(1,);
    await trauma.escalateViolation("actor-viol",);
    expect((await trauma.getStatus("actor-viol",)).severity,).toBe(2,);
    await trauma.applyTrauma("actor-viol", 4,);
    await trauma.escalateViolation("actor-viol",);
    expect((await trauma.getStatus("actor-viol",)).severity,).toBe(4,);
  });

  test("applyFromOutcome writes nothing for satisfaction", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-ok", "Ok",);
    const trauma = new TraumaService(db,);
    expect(await trauma.applyFromOutcome("actor-ok", satisfaction, false, "enc-2",),).toBeNull();
    expect((await trauma.getStatus("actor-ok",)).severity,).toBe(0,);
  });

  test("advanceRecovery clears only expired rows", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-rec", "Rec",);
    const trauma = new TraumaService(db,);
    await trauma.applyTrauma("actor-rec", 1,);
    expect(await trauma.advanceRecovery("actor-rec",),).toBe(0,);
    expect((await trauma.getStatus("actor-rec",)).severity,).toBe(1,);
  });
});
