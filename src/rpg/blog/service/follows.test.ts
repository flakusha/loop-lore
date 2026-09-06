import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertUsers, } from "../../../test-utils/insert-helpers";
import { follow, getFollowers, getFollowStatus, isFollowing, unfollow, } from "./follows";

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
  await insertUsers(db, "follower", "Follower", { id: "user-follower", },);
  await insertUsers(db, "author", "Author", { id: "user-author", },);
  await insertUsers(db, "other", "Other", { id: "user-other", },);
},);

describe("blog follows", () => {
  test("follow round-trips the follow row", async () => {
    const row = await follow(db, "user-follower", "user-author",);
    expect(row.follower_id,).toBe("user-follower",);
    expect(row.author_id,).toBe("user-author",);
    expect(typeof row.id,).toBe("string",);
    expect(await isFollowing(db, "user-follower", "user-author",),).toBeTrue();
  });

  test("duplicate follow rejects on the unique pair", async () => {
    await follow(db, "user-follower", "user-author",);
    expect(follow(db, "user-follower", "user-author",),).rejects.toThrow();
  });

  test("unfollow removes the follow and returns true", async () => {
    await follow(db, "user-follower", "user-author",);
    expect(await unfollow(db, "user-follower", "user-author",),).toBeTrue();
    expect(await isFollowing(db, "user-follower", "user-author",),).toBeFalse();
  });

  test("unfollow on a missing follow returns false", async () => {
    expect(await unfollow(db, "user-follower", "user-author",),).toBeFalse();
  });

  test("unfollow only removes the targeted pair", async () => {
    await follow(db, "user-follower", "user-author",);
    await follow(db, "user-other", "user-author",);
    expect(await unfollow(db, "user-follower", "user-author",),).toBeTrue();
    expect(await isFollowing(db, "user-other", "user-author",),).toBeTrue();
  });

  test("getFollowers lists every follower of the author", async () => {
    await follow(db, "user-follower", "user-author",);
    await follow(db, "user-other", "user-author",);
    expect((await getFollowers(db, "user-author",)).toSorted(),).toEqual(
      ["user-follower", "user-other",],
    );
  });

  test("getFollowers returns empty list when nobody follows", async () => {
    expect(await getFollowers(db, "user-author",),).toEqual([],);
  });

  test("getFollowStatus reports following true and false", async () => {
    expect(await getFollowStatus(db, "user-follower", "user-author",),).toEqual({
      following: false,
    },);
    await follow(db, "user-follower", "user-author",);
    expect(await getFollowStatus(db, "user-follower", "user-author",),).toEqual({
      following: true,
    },);
  });
});
