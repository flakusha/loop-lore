// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/factions.test.ts — faction CRUD, membership, and the
 * pair-normalized diplomatic ledger (migration 062).
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { addMember, createFaction, FactionError, listFactions, removeMember, } from "./factions";
import type { FactionDiplomaticStatus, } from "./factions";
import { breakAlliance, declareWar, formAlliance, proposePeace, } from "./factions-diplomacy";
import { getFactionRelationship, setRelationship, } from "./factions-relationships";

let db: Kysely<DB>;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "Test World", { id: "w1", },);
},);

afterEach(async () => {
  await db.destroy();
},);

/** Create two factions with ids that fix their sort order. */
async function makePair(): Promise<[string, string,]> {
  const a = await createFaction({ db, worldId: "w1", name: "Ashen Guard", },);
  const b = await createFaction({ db, worldId: "w1", name: "River Compact", },);
  const low = a.id < b.id ? a.id : b.id;
  const high = low === a.id ? b.id : a.id;
  return [low, high,];
}

describe("factions", () => {
  test("creates a faction with defaults and lists it in its world", async () => {
    const faction = await createFaction({ db, worldId: "w1", name: "  Ashen Guard  ", },);
    expect(faction.name,).toBe("Ashen Guard",);
    expect(faction.alignment,).toBe("true_neutral",);
    const listed = await listFactions(db, "w1",);
    expect(listed.map((row,) => row.id),).toEqual([faction.id,],);
  });

  test("rejects a blank name", async () => {
    await expect(createFaction({ db, worldId: "w1", name: "   ", },),).rejects.toBeInstanceOf(FactionError,);
  });

  test("members hold one seat and can leave", async () => {
    const faction = await createFaction({ db, worldId: "w1", name: "Ashen Guard", },);
    const member = await addMember({ db, factionId: faction.id, actorId: "actor-1", role: "leader", },);
    expect(member.role,).toBe("leader",);
    await expect(addMember({ db, factionId: faction.id, actorId: "actor-1", },),).rejects.toBeInstanceOf(
      FactionError,
    );

    await removeMember(db, faction.id, "actor-1",);
    const left = await db
      .selectFrom("faction_memberships",)
      .selectAll()
      .where("faction_id", "=", faction.id,)
      .execute();

    expect(left.length,).toBe(0,);
    await expect(removeMember(db, faction.id, "actor-1",),).rejects.toBeInstanceOf(FactionError,);
  });
});

describe("faction relationships", () => {
  test("setRelationship(a,b) is visible through getFactionRelationship(b,a)", async () => {
    const [a, b,] = await makePair();
    const written = await setRelationship({
      db,
      factionA: a,
      factionB: b,
      status: "friendly",
      deltaStanding: 30,
      reason: "shared trade route",
    },);

    const flipped = await getFactionRelationship(db, b, a,);
    expect(flipped?.id,).toBe(written.id,);
    expect(flipped?.status,).toBe("friendly",);
    expect(flipped?.standing,).toBe(30,);

    const rows = await db.selectFrom("faction_relationships",).selectAll().execute();
    expect(rows.length,).toBe(1,);
    expect(rows[0]?.faction_a_id,).toBe(a,);
  });

  test("rejects a self-pair and an empty patch", async () => {
    const [a,] = await makePair();
    await expect(getFactionRelationship(db, a, a,),).rejects.toBeInstanceOf(FactionError,);
    await expect(setRelationship({ db, factionA: a, factionB: "other", },),).rejects.toBeInstanceOf(
      FactionError,
    );
  });

  test("rejects an unknown status instead of failing the CHECK constraint", async () => {
    const [a, b,] = await makePair();
    // The route body types status as a bare string, so garbage reaches here.
    await expect(
      setRelationship({ db, factionA: a, factionB: b, status: "bogus" as FactionDiplomaticStatus, },),
    ).rejects.toThrow(/unknown diplomatic status/,);

    await expect(
      setRelationship({ db, factionA: a, factionB: b, deltaStanding: Number.NaN, },),
    ).rejects.toThrow(/finite number/,);

    const rows = await db.selectFrom("faction_relationships",).selectAll().execute();
    expect(rows.length,).toBe(0,);
  });
});

describe("diplomacy", () => {
  test("declaring war sets at_war and appends history", async () => {
    const [a, b,] = await makePair();
    const war = await declareWar({ db, factionA: a, factionB: b, reason: "border raid", },);
    expect(war.status,).toBe("at_war",);
    expect(war.standing,).toBe(-100,);
    expect(war.history.length,).toBe(1,);
    expect(war.history[0]?.action,).toBe("declare_war",);
    expect(war.history[0]?.fromStatus,).toBe("neutral",);
    expect(war.history[0]?.toStatus,).toBe("at_war",);
    expect(war.history[0]?.reason,).toBe("border raid",);
  });

  test("hostile → allied is rejected; peace first, then alliance", async () => {
    const [a, b,] = await makePair();
    await declareWar({ db, factionA: a, factionB: b, },);
    await expect(formAlliance({ db, factionA: a, factionB: b, },),).rejects.toThrow(/peace first/,);

    const peace = await proposePeace({ db, factionA: a, factionB: b, reason: "truce", },);
    expect(peace.status,).toBe("neutral",);
    expect(peace.standing,).toBe(0,);

    const alliance = await formAlliance({ db, factionA: a, factionB: b, reason: "mutual defense", },);
    expect(alliance.status,).toBe("allied",);
    expect(alliance.history.map((entry,) => entry.action),).toEqual([
      "declare_war",
      "peace",
      "alliance",
    ],);
  });

  test("peace is refused when the pair is not fighting", async () => {
    const [a, b,] = await makePair();
    await expect(proposePeace({ db, factionA: a, factionB: b, },),).rejects.toBeInstanceOf(FactionError,);
  });

  test("breaking an alliance drops the pair to unfriendly and refuses twice", async () => {
    const [a, b,] = await makePair();
    await formAlliance({ db, factionA: a, factionB: b, },);
    const broken = await breakAlliance({ db, factionA: a, factionB: b, reason: "betrayal", },);
    expect(broken.status,).toBe("unfriendly",);
    expect(broken.standing,).toBe(-40,);
    await expect(breakAlliance({ db, factionA: a, factionB: b, },),).rejects.toThrow(
      /cannot break an alliance/,
    );
  });

  test("concurrent setRelationship calls fold both deltas, not just the last", async () => {
    // Seed a KNOWN relationship first, so the concurrent pair is the only thing
    // that can move the standing. The bug: both calls read the same value,
    // compute their own delta, and write it back — the second write clobbers the
    // first. The guard is a status-matched UPDATE; on bun's single-connection
    // driver the transaction serializes them so the second re-derives from the
    // first's result.
    const [a, b,] = await makePair();
    await setRelationship({ db, factionA: a, factionB: b, deltaStanding: 0, },);

    await Promise.all([
      setRelationship({ db, factionA: a, factionB: b, deltaStanding: 10, },),
      setRelationship({ db, factionA: a, factionB: b, deltaStanding: 10, },),
    ],);

    const stored = await getFactionRelationship(db, a, b,);
    expect(stored?.standing,).toBe(20,);
  });
});
