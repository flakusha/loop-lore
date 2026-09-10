// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the tag-facets helper: visible tag names per asset for a viewer
 * (global tags plus the viewer's own user-scoped tags).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertAssetTags, insertUsers, } from "../../test-utils/insert-helpers";
import { visibleTagNames, } from "./tag-facets";

describe("visibleTagNames", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "alice", "Alice", { id: "alice" as never, },);
    await insertUsers(db, "bob", "Bob", { id: "bob" as never, },);
    await insertAssets(db, "alice", "a.png", "image/png", "image", 8, "p/a", { id: "f1" as never, },);
    await insertAssets(db, "alice", "b.png", "image/png", "image", 8, "p/b", { id: "f2" as never, },);
    await insertAssetTags(db, "f1", "cozy", { scope: "global", },);
    await insertAssetTags(db, "f1", "mine", { scope: "user", owner_id: "alice", },);
    await insertAssetTags(db, "f1", "bobs", { scope: "user", owner_id: "bob", },);
    await insertAssetTags(db, "f2", "cozy", { scope: "global", },);
  },);

  afterAll(() => sqlite.close());

  test("viewer sees global tags plus their own user tags, sorted", async () => {
    const map = await visibleTagNames(db, ["f1", "f2",], "alice",);
    expect(map.get("f1",),).toEqual(["cozy", "mine",],);
    expect(map.get("f2",),).toEqual(["cozy",],);
  });

  test("other users' user-scoped tags are not visible", async () => {
    const map = await visibleTagNames(db, ["f1",], "bob",);
    expect(map.get("f1",),).toEqual(["bobs", "cozy",],);
  });

  test("anonymous viewers see only global tags", async () => {
    const map = await visibleTagNames(db, ["f1",], null,);
    expect(map.get("f1",),).toEqual(["cozy",],);
  });

  test("empty asset ids short-circuit without querying", async () => {
    const map = await visibleTagNames(db, [], "alice",);
    expect(map.size,).toBe(0,);
  });
});
