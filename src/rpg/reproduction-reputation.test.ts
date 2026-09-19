// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, } from "../test-utils/insert-helpers";
import { capabilityFor, ReproductionService, } from "./reproduction";
import { ReputationService, } from "./reputation";

createLogger({ level: "error", },);

/** */
async function seedActor(db: Kysely<DB>, id: string, name: string,): Promise<void> {
  await insertActors(db, name, { id, },);
}

describe("reproduction service (TASK-038)", () => {
  test("capability flags: human baseline reproduces, unknown does not", () => {
    expect(capabilityFor("human").canReproduce,).toBeTrue();
    expect(capabilityFor("human").requiresHeat,).toBeFalse();
    expect(capabilityFor("beast").requiresHeat,).toBeTrue();
    expect(capabilityFor("mystery-slime",),).toEqual({
      canReproduce: false, requiresHeat: false, crossFertile: false,
    },);
  });

  test("rollPregnancy returns early for non-reproducing species without rolling", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "carrier-golem", "Golem",);
    await seedActor(db, "sire-golem", "GolemSire",);
    const repro = new ReproductionService(db,);
    // Unknown species → non-reproducing → null, no pregnancy row.
    expect(await repro.rollPregnancy(
      "carrier-golem", "sire-golem", { id: "enc-1", worldId: null, }, "golem", "golem",
    ),).toBeNull();
    expect((await repro.getPregnancy("carrier-golem",)).pregnant,).toBeFalse();
  });

  test("cross-species without dual crossFertile returns null", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "carrier-dwarf", "Dwarf",);
    await seedActor(db, "sire-elf", "Elf",);
    const repro = new ReproductionService(db,);
    // Dwarf (crossFertile false) × elf → blocked.
    expect(await repro.rollPregnancy(
      "carrier-dwarf", "sire-elf", { id: "enc-2", worldId: null, }, "dwarf", "elf",
    ),).toBeNull();
  });

  test("contraceptive guard blocks conception", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "carrier-safe", "Safe",);
    await seedActor(db, "sire-safe", "SafeSire",);
    const { ChemistryService, } = await import("./chemistry");
    await new ChemistryService(db,).applyEffect("carrier-safe", "contraceptive", 86400, 0,);
    const repro = new ReproductionService(db,);
    expect(await repro.rollPregnancy(
      "carrier-safe", "sire-safe", { id: "enc-3", worldId: null, }, "human", "human",
    ),).toBeNull();
    expect((await repro.getPregnancy("carrier-safe",)).pregnant,).toBeFalse();
  });

  test("human roll eventually conceives; gestation, birth, parentage follow", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "carrier-mom", "Mom",);
    await seedActor(db, "sire-dad", "Dad",);
    const repro = new ReproductionService(db,);
    // Base chance 25/100 per roll — retry bounded (fails loudly, not hangs).
    let conceived: string | null = null;
    for (let i = 0; i < 60 && !conceived; i++) {
      conceived = await repro.rollPregnancy(
        "carrier-mom", "sire-dad", { id: `enc-hot-${i}`, worldId: null, }, "human", "human",
      );
    }
    expect(conceived,).not.toBeNull();
    const status = await repro.getPregnancy("carrier-mom",);
    expect(status.pregnant,).toBeTrue();
    expect(status.sireId,).toBe("sire-dad",);
    const advanced = await repro.advanceGestation("carrier-mom", 4,);
    expect(advanced.weeksElapsed,).toBe(4,);
    const childId = await repro.birth("carrier-mom", "Baby",);
    expect(childId,).not.toBeNull();
    // Pregnancy cleared.
    expect((await repro.getPregnancy("carrier-mom",)).pregnant,).toBeFalse();
    // Canonical parentage: bidirectional family rows carrier↔child, sire→child.
    const rels = await db.selectFrom("character_relationships",)
      .where((eb,) => eb.or([
        eb.and({ actor_id: "carrier-mom", target_actor_id: childId!, }),
        eb.and({ actor_id: childId!, target_actor_id: "carrier-mom", }),
        eb.and({ actor_id: "sire-dad", target_actor_id: childId!, }), 
      ],),)
      .selectAll()
      .execute();
    expect(rels.length,).toBe(3,);
    expect(new Set(rels.map((r,) => r.relationship_type,)),).toEqual(new Set(["family",]),);
  });

  test("birth without pregnancy returns null", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "carrier-empty", "Empty",);
    const repro = new ReproductionService(db,);
    expect(await repro.birth("carrier-empty", "Nobody",),).toBeNull();
  });

  test("advanceGestation on non-pregnant returns empty status", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "carrier-flat", "Flat",);
    const repro = new ReproductionService(db,);
    const status = await repro.advanceGestation("carrier-flat", 2,);
    expect(status.pregnant,).toBeFalse();
    expect(status.weeksElapsed,).toBe(0,);
  });
});

describe("reputation service (TASK-042)", () => {
  test("applyDelta persists a row and returns the folded score", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-rep", "Rep",);
    const rep = new ReputationService(db,);
    const score = await rep.applyDelta("actor-rep", "enc-1:successful_intimacy", 12, "private",);
    expect(score.value,).toBe(12,);
    expect(score.source,).toBe("nsfw",);
    const rows = await db.selectFrom("status_effect",)
      .where("actor_id", "=", "actor-rep",)
      .where("category", "=", "reputation",)
      .selectAll()
      .execute();
    expect(rows.length,).toBe(1,);
    expect(rows[0]!.source,).toBe("nsfw",);
    const meta = JSON.parse(rows[0]!.meta!,) as { event: string; actor: string; axis: string; delta: number };
    expect(meta.event,).toBe("nsfw.reputation_changed",);
    expect(meta.actor,).toBe("actor-rep",);
    expect(meta.axis,).toBe("private",);
    expect(meta.delta,).toBe(12,);
  });

  test("getScore replays rows from zero (Social/Faction see same deltas)", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-replay", "Replay",);
    const rep = new ReputationService(db,);
    await rep.applyDelta("actor-replay", "src-a", 10,);
    await rep.applyDelta("actor-replay", "src-b", -4,);
    const score = await rep.getScore("actor-replay",);
    expect(score.value,).toBe(6,);
    expect(score.modifiers.length,).toBe(2,);
  });

  test("axes scope independently", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-axes", "Axes",);
    const rep = new ReputationService(db,);
    await rep.applyDelta("actor-axes", "src-pub", 20, "public",);
    expect((await rep.getScore("actor-axes", "public",)).value,).toBe(20,);
    expect((await rep.getScore("actor-axes", "private",)).value,).toBe(0,);
  });

  test("deriveRumors emits only public/group/loud rows", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-rumor", "Rumor",);
    const rep = new ReputationService(db,);
    await rep.applyDelta("actor-rumor", "quiet-night", 3, "private",);
    expect(await rep.deriveRumors("actor-rumor",),).toEqual([],);
    await rep.applyDelta("actor-rumor", "loud-scandal", -15, "private",);
    await rep.applyDelta("actor-rumor", "public-gala", 5, "public",);
    const rumors = await rep.deriveRumors("actor-rumor",);
    expect(rumors.length,).toBe(2,);
  });

  test("applyEncounterReputation follows the canonical publish path", async () => {
    const { db, } = await createTestDb();
    await seedActor(db, "actor-perc", "Perc",);
    const rep = new ReputationService(db,);
    // success, private, intimacy 10 → 5 + 5 = 10.
    const score = await rep.applyEncounterReputation("enc-9", "actor-perc", true, "private", 10,);
    expect(score.value,).toBe(10,);
    expect((await rep.getScore("actor-perc",)).value,).toBe(10,);
  });
});
