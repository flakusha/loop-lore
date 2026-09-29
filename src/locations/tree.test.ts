// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { createTestDb, resetTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { LocationTreeService, } from "./tree";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
  await insertUsers(testDb.db, "test-owner", "Test Owner", { id: "test-owner", },);
},);

afterAll(async () => {
  await testDb.db.destroy();
  testDb.sqlite.close();
},);

async function reset(): Promise<void> {
  await resetTestDb(testDb.sqlite,);
}

function id(): string {
  return randomUUID();
}

async function insertLocation(worldId: string, name: string, parentId: string | null = null,): Promise<string> {
  const newId = id();
  // Insert via raw SQL so path triggers fire (Kysely insert builders also work, this is just explicit).
  testDb.sqlite.run(
    `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
       VALUES (?, ?, ?, ?, '[]', 'draft', ?, 'region', 'static')`,
    [newId, worldId, name, "", parentId,],
  );
  return newId;
}

async function insertWorld(ownerId: string,): Promise<string> {
  const worldId = id();
  await insertWorlds(testDb.db, ownerId, `world-${worldId.slice(0, 8,)}`, { id: worldId, },);
  return worldId;
}

describe("LocationTreeService", () => {
  test("computeChildPath: root has path '/id/'", () => {
    expect(LocationTreeService.computeChildPath(null, "abc",),).toBe("/abc/",);
  });

  test("computeChildPath: child of /parent/ has path '/parent/child/'", () => {
    expect(LocationTreeService.computeChildPath("/parent/", "child",),).toBe("/parent/child/",);
  });

  test("computeChildPath: tolerates trailing slash variations", () => {
    expect(LocationTreeService.computeChildPath("/parent", "child",),).toBe("/parent/child/",);
  });

  describe("with seeded fractal fixture", () => {
    let worldId: string;
    let rootId: string;
    let regionId: string;
    let settlementId: string;
    let buildingId: string;
    let roomId: string;
    let siblingRootId: string;

    beforeAll(async () => {
      await reset();
      await insertUsers(testDb.db, "test-owner", "Test Owner", { id: "test-owner", },);
      worldId = await insertWorld("test-owner",);
      // Two siblings at the top, then a deeper chain under root.
      rootId = await insertLocation(worldId, "Root",);
      siblingRootId = await insertLocation(worldId, "SiblingRoot",);
      regionId = await insertLocation(worldId, "Region", rootId,);
      settlementId = await insertLocation(worldId, "Settlement", regionId,);
      buildingId = await insertLocation(worldId, "Building", settlementId,);
      roomId = await insertLocation(worldId, "Room", buildingId,);
    },);

    test("path was auto-materialized by the trigger", async () => {
      const rows = testDb.sqlite.query(
        `SELECT id, path FROM locations WHERE id IN (?, ?, ?, ?, ?)`,
      ).all(rootId, regionId, settlementId, buildingId, roomId,) as Array<{
        id: string;
        path: string;
      }>;
      const byId = Object.fromEntries(rows.map((r,) => [r.id, r.path,]),);
      expect(byId[rootId],).toBe(`/${rootId}/`,);
      expect(byId[regionId],).toBe(`/${rootId}/${regionId}/`,);
      expect(byId[settlementId],).toBe(`/${rootId}/${regionId}/${settlementId}/`,);
      expect(byId[buildingId],).toBe(`/${rootId}/${regionId}/${settlementId}/${buildingId}/`,);
      expect(byId[roomId],).toBe(
        `/${rootId}/${regionId}/${settlementId}/${buildingId}/${roomId}/`,
      );
    });

    test("getAncestors returns root-most first", async () => {
      const svc = new LocationTreeService(testDb.db,);
      const ancestors = await svc.getAncestors(roomId,);
      // Root is 4 hops up, building is 1 hop up.
      expect(ancestors.map((a,) => a.id),).toEqual([rootId, regionId, settlementId, buildingId,],);
      expect(ancestors.map((a,) => a.depth),).toEqual([4, 3, 2, 1,],);
    });

    test("getDescendants is direct-children-first by depth", async () => {
      const svc = new LocationTreeService(testDb.db,);
      const descendants = await svc.getDescendants(rootId,);
      // Excludes root itself; deep → shallow order.
      expect(descendants.map((d,) => d.id),).toEqual(
        [regionId, settlementId, buildingId, roomId,],
      );
      expect(descendants.map((d,) => d.depth),).toEqual([1, 2, 3, 4,],);
    });

    test("getAncestors of root returns empty", async () => {
      const svc = new LocationTreeService(testDb.db,);
      expect(await svc.getAncestors(rootId,),).toEqual([],);
    });

    test("repairPath returns canonical path for an existing location", async () => {
      const svc = new LocationTreeService(testDb.db,);
      const path = await svc.repairPath(settlementId,);
      expect(path,).toBe(`/${rootId}/${regionId}/${settlementId}/`,);
    });

    test("moveSubtree updates parent and trigger rewrites subtree paths", async () => {
      const svc = new LocationTreeService(testDb.db,);
      // Move region (and its subtree) under siblingRootId.
      await svc.moveSubtree(regionId, siblingRootId,);
      const regionRow = testDb.sqlite.query(
        `SELECT path FROM locations WHERE id = ?`,
      ).get(regionId,) as { path: string };
      expect(regionRow.path,).toBe(`/${siblingRootId}/${regionId}/`,);
      // Child paths must also rewrite via trg_locations_path_on_update.
      const roomRow = testDb.sqlite.query(
        `SELECT path FROM locations WHERE id = ?`,
      ).get(roomId,) as { path: string };
      expect(roomRow.path,).toBe(
        `/${siblingRootId}/${regionId}/${settlementId}/${buildingId}/${roomId}/`,
      );
    });

    test("moveSubtree rejects cross-world parent at the app layer", async () => {
      const svc = new LocationTreeService(testDb.db,);
      const otherWorldId = await insertWorld("test-owner",);
      const otherRootId = await insertLocation(otherWorldId, "OtherRoot",);
      await expect(svc.moveSubtree(rootId, otherRootId,),).rejects.toThrow(/cross-world/,);
    });

    test("moveSubtree rejects self-parent", async () => {
      const svc = new LocationTreeService(testDb.db,);
      await expect(svc.moveSubtree(rootId, rootId,),).rejects.toThrow(/own parent/,);
    });

    test("insertLocation enforces the depth limit at the service layer", async () => {
      const svc = new LocationTreeService(testDb.db,);
      // Build a chain exactly to the limit (LOCATION_DEPTH_LIMIT=12), then verify the next insert rejects.
      let parent: string | null = null;
      for (let i = 0; i < 12; i++) {
        parent = await svc.insertLocation({
          worldId,
          name: `deep-${i}`,
          parentLocationId: parent,
        },);
      }
      // The 13th insert must exceed the depth limit.
      expect(
        svc.insertLocation({ worldId, name: "too-deep", parentLocationId: parent, },),
      ).rejects.toThrow(/depth/,);
    });
  });

  describe("edge cases and uncovered branches", () => {
    let worldId: string;
    let rootId: string;
    let regionId: string;
    let settlementId: string;
    let buildingId: string;
    let roomId: string;

    beforeAll(async () => {
      await reset();
      await insertUsers(testDb.db, "test-owner", "Test Owner", { id: "test-owner", },);
      worldId = await insertWorld("test-owner",);
      rootId = await insertLocation(worldId, "Root",);
      regionId = await insertLocation(worldId, "Region", rootId,);
      settlementId = await insertLocation(worldId, "Settlement", regionId,);
      buildingId = await insertLocation(worldId, "Building", settlementId,);
      roomId = await insertLocation(worldId, "Room", buildingId,);
    },);

    test("depth: null and empty paths are depth 1", () => {
      expect(LocationTreeService.depth(null,),).toBe(1,);
      expect(LocationTreeService.depth("",),).toBe(1,);
    });

    test("depth: counts separators in materialized paths", () => {
      expect(LocationTreeService.depth("/a/",),).toBe(1,);
      expect(LocationTreeService.depth("/a/b/",),).toBe(2,);
      expect(LocationTreeService.depth("/a/b/c/",),).toBe(3,);
    });

    test("insertLocation rejects a missing parent", async () => {
      const svc = new LocationTreeService(testDb.db,);
      await expect(svc.insertLocation({
        worldId,
        name: "Orphan",
        parentLocationId: randomUUID(),
      },),).rejects.toThrow("parent location not found",);
    });

    test("insertLocation rejects a cross-world parent", async () => {
      const svc = new LocationTreeService(testDb.db,);
      const otherWorldId = await insertWorld("test-owner",);
      const otherRootId = await insertLocation(otherWorldId, "OtherRoot",);
      await expect(svc.insertLocation({
        worldId,
        name: "Sneaky",
        parentLocationId: otherRootId,
      },),).rejects.toThrow("cross-world parent rejected",);
    });

    test("insertLocation persists custom fields", async () => {
      const svc = new LocationTreeService(testDb.db,);
      const newId = await svc.insertLocation({
        worldId,
        name: "Custom",
        description: "desc",
        kind: "settlement",
        mobilityMode: "free",
        parentLocationId: rootId,
      },);
      const row = testDb.sqlite.query(
        `SELECT world_id, description, connections, publication_status, kind, mobility_mode, parent_location_id
         FROM locations WHERE id = ?`,
      ).get(newId,) as Record<string, unknown>;
      expect(row.world_id,).toBe(worldId,);
      expect(row.description,).toBe("desc",);
      expect(row.connections,).toBe("[]",);
      expect(row.publication_status,).toBe("draft",);
      expect(row.kind,).toBe("settlement",);
      expect(row.mobility_mode,).toBe("free",);
      expect(row.parent_location_id,).toBe(rootId,);
    });

    test("insertLocation applies region/static defaults when kind and mobilityMode are omitted", async () => {
      const svc = new LocationTreeService(testDb.db,);
      const newId = await svc.insertLocation({ worldId, name: "Defaults", parentLocationId: null, },);
      const row = testDb.sqlite.query(
        `SELECT description, connections, publication_status, kind, mobility_mode FROM locations WHERE id = ?`,
      ).get(newId,) as Record<string, unknown>;
      expect(row.description,).toBe("",);
      expect(row.connections,).toBe("[]",);
      expect(row.publication_status,).toBe("draft",);
      expect(row.kind,).toBe("region",);
      expect(row.mobility_mode,).toBe("static",);
    });

    test("repairPath returns empty string for an unknown location", async () => {
      const svc = new LocationTreeService(testDb.db,);
      expect(await svc.repairPath(randomUUID(),),).toBe("",);
    });

    test("repairPath on a root recomputes '/id/'", async () => {
      const svc = new LocationTreeService(testDb.db,);
      expect(await svc.repairPath(rootId,),).toBe(`/${rootId}/`,);
    });

    test("getDescendants of a leaf returns empty", async () => {
      const svc = new LocationTreeService(testDb.db,);
      expect(await svc.getDescendants(roomId,),).toEqual([],);
    });

    test("tree returns empty for a world with no locations", async () => {
      const svc = new LocationTreeService(testDb.db,);
      const emptyWorldId = await insertWorld("test-owner",);
      expect(await svc.tree(emptyWorldId,),).toEqual([],);
    });

    test("tree returns a single root with no children", async () => {
      const svc = new LocationTreeService(testDb.db,);
      const singleWorldId = await insertWorld("test-owner",);
      const singleRootId = await insertLocation(singleWorldId, "OnlyRoot",);
      const nodes = await svc.tree(singleWorldId,);
      expect(nodes,).toHaveLength(1,);
      expect(nodes[0]!.id,).toBe(singleRootId,);
      expect(nodes[0]!.children,).toEqual([],);
    });

    test("tree nests children under parents with roots ordered by name", async () => {
      const svc = new LocationTreeService(testDb.db,);
      const treeWorldId = await insertWorld("test-owner",);
      // Insert out of name order to prove ordering comes from the query, not insertion.
      const zeta = await insertLocation(treeWorldId, "Zeta",);
      const alpha = await insertLocation(treeWorldId, "Alpha",);
      const alphaChild = await insertLocation(treeWorldId, "AlphaChild", alpha,);
      const alphaGrandchild = await insertLocation(treeWorldId, "AlphaGrandchild", alphaChild,);
      const zetaChild = await insertLocation(treeWorldId, "ZetaChild", zeta,);
      const nodes = await svc.tree(treeWorldId,);
      expect(nodes.map((n,) => n.id),).toEqual([alpha, zeta,],);
      expect(nodes[0]!.children.map((c,) => c.id),).toEqual([alphaChild,],);
      expect(nodes[0]!.children[0]!.children.map((c,) => c.id),).toEqual([alphaGrandchild,],);
      expect(nodes[0]!.children[0]!.children[0]!.children,).toEqual([],);
      expect(nodes[1]!.children.map((c,) => c.id),).toEqual([zetaChild,],);
      // tree() stamps depth 0 and the node's own id as path.
      expect(nodes[0]!.depth,).toBe(0,);
      expect(nodes[0]!.path,).toBe(alpha,);
    });

    test("moveSubtree rejects a move that would create a cycle", async () => {
      const svc = new LocationTreeService(testDb.db,);
      // roomId is a descendant of rootId — moving root under room is a cycle.
      await expect(svc.moveSubtree(rootId, roomId,),).rejects.toThrow("move would create a cycle",);
    });

    test("moveSubtree rejects unknown location or parent", async () => {
      const svc = new LocationTreeService(testDb.db,);
      await expect(svc.moveSubtree(randomUUID(), rootId,),).rejects.toThrow("location or parent not found",);
      await expect(svc.moveSubtree(rootId, randomUUID(),),).rejects.toThrow("location or parent not found",);
    });

    test("moveSubtree to null re-parents to the world root and rewrites paths", async () => {
      const svc = new LocationTreeService(testDb.db,);
      const moveWorldId = await insertWorld("test-owner",);
      const moveRoot = await insertLocation(moveWorldId, "MoveRoot",);
      const moveChild = await insertLocation(moveWorldId, "MoveChild", moveRoot,);
      await svc.moveSubtree(moveRoot, null,);
      const rootRow = testDb.sqlite.query(
        `SELECT parent_location_id, path FROM locations WHERE id = ?`,
      ).get(moveRoot,) as { parent_location_id: string | null; path: string };
      expect(rootRow.parent_location_id,).toBeNull();
      expect(rootRow.path,).toBe(`/${moveRoot}/`,);
      const childRow = testDb.sqlite.query(
        `SELECT path FROM locations WHERE id = ?`,
      ).get(moveChild,) as { path: string };
      expect(childRow.path,).toBe(`/${moveRoot}/${moveChild}/`,);
    });
  });
});
