import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertBlogPosts, insertUsers, } from "../../../test-utils/insert-helpers";
import { addTags, clearTags, getTags, } from "./tags";

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
  await insertBlogPosts(db, "user-author", "Title", "Body", { id: "post-1", },);
},);

describe("blog tags", () => {
  test("addTags round-trips tags for a post", async () => {
    await addTags(db, "post-1", ["rust", "fantasy",],);
    expect((await getTags(db, "post-1",)).toSorted(),).toEqual(
      ["fantasy", "rust",],
    );
  });

  test("addTags normalizes case and whitespace", async () => {
    await addTags(db, "post-1", ["  Rust  ", "FANTASY", "sci-fi",],);
    expect((await getTags(db, "post-1",)).toSorted(),).toEqual(
      ["fantasy", "rust", "sci-fi",],
    );
  });

  test("getTags returns empty list for a post with no tags", async () => {
    expect(await getTags(db, "post-1",),).toEqual([],);
  });

  test("getTags returns empty list for an unknown post", async () => {
    expect(await getTags(db, "post-missing",),).toEqual([],);
  });

  test("clearTags removes every tag on the post", async () => {
    await addTags(db, "post-1", ["rust", "fantasy",],);
    await clearTags(db, "post-1",);
    expect(await getTags(db, "post-1",),).toEqual([],);
  });

  test("clearTags on a tagless post is a no-op", async () => {
    await clearTags(db, "post-1",);
    expect(await getTags(db, "post-1",),).toEqual([],);
  });

  test("clearTags only clears the targeted post", async () => {
    await insertBlogPosts(db, "user-author", "Other", "Body", { id: "post-2", },);
    await addTags(db, "post-1", ["rust",],);
    await addTags(db, "post-2", ["fantasy",],);
    await clearTags(db, "post-1",);
    expect(await getTags(db, "post-1",),).toEqual([],);
    expect(await getTags(db, "post-2",),).toEqual(["fantasy",],);
  });

  test("re-adding after clear stores only the new tags", async () => {
    await addTags(db, "post-1", ["rust",],);
    await clearTags(db, "post-1",);
    await addTags(db, "post-1", ["horror",],);
    expect(await getTags(db, "post-1",),).toEqual(["horror",],);
  });
});
