// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cross-tenant scope guard for factions: `requireFactionsInWorld`.
 *
 * `requireWorldAccess` authorizes `:worldId`, but factions are addressed by
 * their OWN id in the path and in the diplomacy pair bodies. Without this
 * second scope check, a caller who legitimately owns world A could rewrite or
 * read world B's factions by putting a foreign faction id in the request — the
 * world check passes and the faction id is never tied back to it.
 *
 * Contract pinned here: every supplied faction id must exist AND belong to the
 * authorized world, or the answer is 404 (not 403 — a 403 would confirm that a
 * foreign faction exists).
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertFactions, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { requireFactionsInWorld, } from "./faction-routes-shared";

const OWNER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const UNKNOWN_FACTION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

interface SeededWorlds {
  worldA: string;
  worldB: string;
  factionInA: string;
  factionInB: string;
}

/** Two worlds owned by the same user, each holding one faction. */
async function seed(db: Kysely<DB>,): Promise<SeededWorlds> {
  // worlds.owner_id references users.id, so the owner row must exist first.
  await insertUsers(db, "faction-owner", "Faction Owner", { id: OWNER_ID, } as never,);

  const worldA = await insertWorlds(db, OWNER_ID, "World A", {} as never,);
  const worldB = await insertWorlds(db, OWNER_ID, "World B", {} as never,);
  const factionInA = await insertFactions(db, worldA, "A Faction", {} as never,);
  const factionInB = await insertFactions(db, worldB, "B Faction", {} as never,);

  return { worldA, worldB, factionInA, factionInB, };
}

describe("requireFactionsInWorld", () => {
  test("a faction belonging to the authorized world passes (null, no error)", async () => {
    const { db, } = await createTestDb();
    const { worldA, factionInA, } = await seed(db,);

    const err = await requireFactionsInWorld(db, worldA, [factionInA,],);

    expect(err,).toBeNull();

    await db.destroy();
  });

  test("a faction belonging to ANOTHER world is refused with 404", async () => {
    const { db, } = await createTestDb();
    const { worldA, factionInB, } = await seed(db,);

    // Both worlds belong to the same owner, so world ownership cannot be what
    // stops this — only the faction-to-world scope check can.
    const err = await requireFactionsInWorld(db, worldA, [factionInB,],);

    expect(err,).toBeInstanceOf(Response,);
    expect((err as Response).status,).toBe(404,);

    await db.destroy();
  });

  test("a diplomacy pair is refused when only ONE side belongs to the world", async () => {
    const { db, } = await createTestDb();
    const { worldA, factionInA, factionInB, } = await seed(db,);

    // The mixed pair is the real attack: a legitimate faction on one side and
    // a foreign one on the other, so a permissive "any matches" check passes.
    const err = await requireFactionsInWorld(db, worldA, [factionInA, factionInB,],);

    expect(err,).toBeInstanceOf(Response,);
    expect((err as Response).status,).toBe(404,);

    await db.destroy();
  });

  test("a non-existent faction id is refused with 404", async () => {
    const { db, } = await createTestDb();
    const { worldA, } = await seed(db,);

    const err = await requireFactionsInWorld(db, worldA, [UNKNOWN_FACTION_ID,],);

    expect(err,).toBeInstanceOf(Response,);
    expect((err as Response).status,).toBe(404,);

    await db.destroy();
  });

  test("both factions of a same-world diplomacy pair pass", async () => {
    const { db, } = await createTestDb();
    const { worldA, } = await seed(db,);

    const first = await insertFactions(db, worldA, "A Second", {} as never,);
    const second = await insertFactions(db, worldA, "A Third", {} as never,);

    const err = await requireFactionsInWorld(db, worldA, [first, second,],);

    expect(err,).toBeNull();

    await db.destroy();
  });

  test("an empty id list passes — the caller supplied nothing to scope-check", async () => {
    const { db, } = await createTestDb();
    const { worldA, } = await seed(db,);

    const err = await requireFactionsInWorld(db, worldA, [],);

    expect(err,).toBeNull();

    await db.destroy();
  });

  test("a repeated id is not mistaken for two distinct matches, nor rejected", async () => {
    const { db, } = await createTestDb();
    const { worldA, factionInA, } = await seed(db,);

    // The guard compares found.length against new Set(ids).size, so the
    // duplicate must satisfy the size check without being a second row.
    const err = await requireFactionsInWorld(db, worldA, [factionInA, factionInA,],);

    expect(err,).toBeNull();

    await db.destroy();
  });

  test("a duplicated FOREIGN id is still refused", async () => {
    const { db, } = await createTestDb();
    const { worldA, factionInB, } = await seed(db,);

    // The duplicate must not be what lets the foreign pair through.
    const err = await requireFactionsInWorld(db, worldA, [factionInB, factionInB,],);

    expect(err,).toBeInstanceOf(Response,);
    expect((err as Response).status,).toBe(404,);

    await db.destroy();
  });
});
