// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { LOCATION_DEPTH_LIMIT, } from "../../db/enums-story/world";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import type { WorldBundle, } from "../export-shared";
import { ImportCycleError, importWorldBundle, } from "./bundle";

let testDb: TestDb;
let userId: string;

beforeAll(async () => {
  testDb = await createTestDb();
  userId = await insertUsers(testDb.db, "bundle-import-owner", "Bundle Import Owner", {
    id: "bundle-import-owner",
  },);
},);

afterAll(async () => {
  await testDb.db.destroy();
  testDb.sqlite.close();
},);

interface BundleLocation {
  id: string;
  name: string;
  parent_location_id: string | null;
  world_id?: string;
}

/** Hand-built bundle; `world_id` is optional as in the older import fixtures. */
function makeBundle(name: string, locations: BundleLocation[], worldId?: string,): WorldBundle {
  return {
    schema_version: "1.0",
    world: worldId ? { id: worldId, name, } : { name, },
    locations,
    world_lore_entries: [],
    quests: [],
    world_states: [],
    location_states: [],
  } as unknown as WorldBundle;
}

async function rejectionFrom(promise: Promise<unknown>,): Promise<ImportCycleError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ImportCycleError) { return error; }
    throw error;
  }

  throw new Error("expected the import to be rejected",);
}

/** Worlds committed under a bundle name — zero proves the guard ran before any insert. */
async function committedWorlds(name: string,): Promise<number> {
  const rows = await testDb.db
    .selectFrom("worlds",)
    .select("id",)
    .where("name", "=", name,)
    .execute();

  return rows.length;
}

describe("importWorldBundle — parent graph guard", () => {
  test("rejects a self-parent graph before writing", async () => {
    const locationId = randomUUID();
    const name = "BundleSelfParent";
    const error = await rejectionFrom(
      importWorldBundle(
        testDb.db,
        userId,
        makeBundle(name, [
          { id: locationId, name: "A", parent_location_id: locationId, },
        ],),
      ),
    );

    expect(error.message,).toBe(`location ${locationId} cannot be its own parent`,);
    expect(await committedWorlds(name,),).toBe(0,);
  });

  test("rejects a cross-world parent before writing", async () => {
    const parentId = randomUUID();
    const childId = randomUUID();
    const name = "BundleCrossWorld";
    const error = await rejectionFrom(
      importWorldBundle(
        testDb.db,
        userId,
        makeBundle(name, [
          { id: parentId, name: "ForeignRoot", parent_location_id: null, world_id: "foreign-world", },
          { id: childId, name: "Child", parent_location_id: parentId, world_id: "home-world", },
        ],),
      ),
    );

    expect(error.message,).toBe(`location ${childId} has a cross-world parent`,);
    expect(await committedWorlds(name,),).toBe(0,);
  });

  test("rejects a graph deeper than the depth limit before writing", async () => {
    const worldId = randomUUID();
    const name = "BundleOverDepth";
    const ids = Array.from({ length: LOCATION_DEPTH_LIMIT + 1, }, () => randomUUID(),);
    const locations = ids.map((id, index,) => ({
      id,
      name: `Level${index + 1}`,
      parent_location_id: index === 0 ? null : ids[index - 1]!,
      world_id: worldId,
    }));

    const error = await rejectionFrom(
      importWorldBundle(testDb.db, userId, makeBundle(name, locations, worldId,),),
    );

    expect(error.message,).toMatch(/exceeds depth limit/,);
    expect(await committedWorlds(name,),).toBe(0,);
  });

  test("imports a valid two-level graph with remapped parent and path", async () => {
    const worldId = randomUUID();
    const rootId = randomUUID();
    const childId = randomUUID();
    const name = "BundleValid";
    const { worldId: importedId, counts, } = await importWorldBundle(
      testDb.db,
      userId,
      makeBundle(name, [
        { id: rootId, name: "Root", parent_location_id: null, world_id: worldId, },
        { id: childId, name: "Child", parent_location_id: rootId, world_id: worldId, },
      ], worldId,),
    );

    expect(counts.locations,).toBe(2,);
    expect(await committedWorlds(name,),).toBe(1,);
    const locations = await testDb.db
      .selectFrom("locations",)
      .select(["id", "name", "parent_location_id", "path",],)
      .where("world_id", "=", importedId,)
      .orderBy("name", "asc",)
      .execute();

    const [child, root,] = locations;
    expect(root?.name,).toBe("Root",);
    expect(root?.parent_location_id,).toBeNull();
    expect(child?.parent_location_id,).toBe(root?.id,);
    expect(child?.path,).toBe(`/${root?.id}/${child?.id}/`,);
  });
});
