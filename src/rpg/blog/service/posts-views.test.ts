// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for blog post view counting. */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertBlogPosts, insertUsers, } from "../../../test-utils/insert-helpers";
import { incrementViewCount, } from "./posts-views";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  sqlite = testDb.sqlite;
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "author", "Author", { id: "user-author", },);
  await insertBlogPosts(db, "user-author", "Title", "Body", { id: "post-1", view_count: 7, },);
  await insertBlogPosts(db, "user-author", "Unviewed", "Body", { id: "post-2", },);
},);

async function viewCount(id: string,): Promise<unknown> {
  const row = await db
    .selectFrom("blog_posts",)
    .select("view_count",)
    .where("id", "=", id,)
    .executeTakeFirst();
  return row?.view_count;
}

describe("incrementViewCount", () => {
  test("increments an existing count", async () => {
    await incrementViewCount(db, "post-1",);
    expect(await viewCount("post-1",),).toBe(8,);
  });

  test("treats a missing count as zero", async () => {
    await incrementViewCount(db, "post-2",);
    expect(await viewCount("post-2",),).toBe(1,);
  });

  test("unknown id is a silent no-op", async () => {
    await incrementViewCount(db, "post-missing",);
    expect(await viewCount("post-1",),).toBe(7,);
  });
});
