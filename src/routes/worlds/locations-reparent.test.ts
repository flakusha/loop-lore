// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for the guarded location reparent helper. The route funnels every
// parent_location_id write through here so a raw UPDATE can never create a
// parent cycle, which would wedge the recursive-CTE path-rewrite trigger.

import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { reparentLocation, } from "./locations-reparent";

let testDb: TestDb;
let worldId: string;
let otherWorldId: string;

/** Insert via raw SQL so the path triggers fire, matching how locations land in prod. */
function insertLocation(worldId: string, name: string, parentId: string | null = null,): string {
  const newId = randomUUID();
  testDb.sqlite.run(
    `INSERT INTO locations (id, world_id, name, description, connections, publication_status, parent_location_id, kind, mobility_mode)
       VALUES (?, ?, ?, ?, '[]', 'draft', ?, 'region', 'static')`,
    [newId, worldId, name, "", parentId,],
  );

  return newId;
}

/** A fresh root → child → grandchild chain in `worldId`. */
function seedChain(): { root: string; child: string; grandchild: string } {
  const root = insertLocation(worldId, "Root",);
  const child = insertLocation(worldId, "Child", root,);
  const grandchild = insertLocation(worldId, "Grandchild", child,);
  return { root, child, grandchild, };
}

/** Read back parent + materialized path straight from SQLite. */
function rowOnDisk(locationId: string,): { parent_location_id: string | null; path: string } {
  return testDb.sqlite.query(
    `SELECT parent_location_id, path FROM locations WHERE id = ?`,
  ).get(locationId,) as { parent_location_id: string | null; path: string };
}

/** Assert a returned Response carries the expected status and `error` message. */
async function expectJsonError(
  response: Response | null,
  status: number,
  message: string,
): Promise<void> {
  if (response === null) { throw new Error("expected an error Response, got null (move succeeded)",); }
  expect(response.status,).toBe(status,);
  const body = (await response.json()) as { error: string };
  expect(body.error,).toBe(message,);
}

beforeAll(async () => {
  testDb = await createTestDb();
  await insertUsers(testDb.db, "test-owner", "Test Owner", { id: "test-owner", },);
  worldId = await insertWorlds(testDb.db, "test-owner", "reparent-world",);
  otherWorldId = await insertWorlds(testDb.db, "test-owner", "other-world",);
},);

afterAll(async () => {
  await testDb.db.destroy();
  testDb.sqlite.close();
},);

beforeEach(async () => {
  testDb.sqlite.run("DELETE FROM locations",);
},);

describe("reparentLocation", () => {
  test("moves the location and rewrites the paths of its whole subtree", async () => {
    const newParent = insertLocation(worldId, "NewParent",);
    const { child, grandchild, } = seedChain();

    const result = await reparentLocation(testDb.db, worldId, child, newParent,);

    expect(result,).toBeNull();
    expect(rowOnDisk(child,).parent_location_id,).toBe(newParent,);
    expect(rowOnDisk(child,).path,).toBe(`/${newParent}/${child}/`,);
    // The trigger repaths everything below the moved node, not just the node.
    expect(rowOnDisk(grandchild,).path,).toBe(`/${newParent}/${child}/${grandchild}/`,);
  });

  test("an unknown location id yields 404 without touching the new parent", async () => {
    const { root, } = seedChain();
    const response = await reparentLocation(testDb.db, worldId, randomUUID(), root,);

    await expectJsonError(response, 404, "Location not found",);
    expect(rowOnDisk(root,).parent_location_id,).toBeNull();
  });

  test("a location belonging to another world yields 404 (world-scoped lookup)", async () => {
    const foreign = insertLocation(otherWorldId, "Foreign",);
    const { root, } = seedChain();
    const response = await reparentLocation(testDb.db, worldId, foreign, root,);

    await expectJsonError(response, 404, "Location not found",);
    expect(rowOnDisk(foreign,).parent_location_id,).toBeNull();
  });

  test("an unknown parent yields 404 'location or parent not found'", async () => {
    const { root, } = seedChain();
    const response = await reparentLocation(testDb.db, worldId, root, randomUUID(),);

    await expectJsonError(response, 404, "location or parent not found",);
    expect(rowOnDisk(root,).parent_location_id,).toBeNull();
  });

  test("a self-parent move yields 400 carrying the service message", async () => {
    const { root, } = seedChain();
    const response = await reparentLocation(testDb.db, worldId, root, root,);

    await expectJsonError(response, 400, "location cannot be its own parent",);
    expect(rowOnDisk(root,).parent_location_id,).toBeNull();
  });

  test("a cross-world parent yields 404, not 400", async () => {
    // The code→status mapping is the whole point of LocationMoveError: the same
    // 4xx carries a different status depending on WHY the move was refused.
    const { root, } = seedChain();
    const foreignRoot = insertLocation(otherWorldId, "ForeignRoot",);
    const response = await reparentLocation(testDb.db, worldId, root, foreignRoot,);

    await expectJsonError(response, 404, "cross-world move rejected",);
    expect(rowOnDisk(root,).parent_location_id,).toBeNull();
  });

  test("a move under the location's own descendant yields 400 and creates no cycle", async () => {
    const { root, child, grandchild, } = seedChain();
    const response = await reparentLocation(testDb.db, worldId, root, grandchild,);

    await expectJsonError(response, 400, "move would create a cycle",);
    // The guard must fire BEFORE the UPDATE — otherwise the trigger hangs.
    expect(rowOnDisk(root,).parent_location_id,).toBeNull();
    expect(rowOnDisk(grandchild,).parent_location_id,).toBe(child,);
    expect(rowOnDisk(child,).path,).toBe(`/${root}/${child}/`,);
  });
});
