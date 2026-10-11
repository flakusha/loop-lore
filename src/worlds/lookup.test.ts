// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/lookup.test.ts — unit tests for the shared world existence
 * probe. Both consumers (`src/worlds/timescale.ts` and
 * `src/nsfw/moderation-service/overrides.ts`) decide what to DO about a
 * missing world; this pins the probe's two results: the projected row,
 * or `undefined`.
 *
 * RESOURCE CONTRACT — what each test owns:
 * - DB: `createTestDb()` mints a PRIVATE `new Database(":memory:")` per call
 *   and never touches the process-global `testDatabaseOverride`, so every
 *   test here owns its own schema and no fixed path, port or collection name
 *   is shared. Nothing to serialize against.
 * - Teardown: `destroyTestDb(fixture)` — not a bare `db.destroy()`. It clears
 *   a stale global override first (a closed handle left in the global would be
 *   handed to every sibling file in this process) and closes BOTH the Kysely
 *   wrapper and the raw bun:sqlite handle. Dropping `sqlite` would leak one
 *   file descriptor per test, which only surfaces under parallel runners.
 * - Ordering: none. Each test re-seeds its own user/world in `beforeEach`, so
 *   every test passes alone and in any order.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { findWorld, } from "./lookup";

let fixture: TestDb;

beforeEach(async () => {
  fixture = await createTestDb();
  await insertUsers(fixture.db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(fixture.db, "user-owner", "Test World", { id: "w1", },);
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

describe("findWorld", () => {
  test("returns the id of an existing world", async () => {
    expect(await findWorld(fixture.db, "w1",),).toEqual({ id: "w1", },);
  });

  test("returns undefined for an unknown world", async () => {
    expect(await findWorld(fixture.db, "ghost",),).toBeUndefined();
  });
});
