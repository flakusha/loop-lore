import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertBlogPosts, insertUsers, } from "../../../test-utils/insert-helpers";
import {
  createComment,
  getComment,
  listComments,
  listCommentsThreaded,
  moderateComment,
} from "./comments";

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
  await insertActors(db, "Commenter", { id: "actor-commenter", },);
  await insertBlogPosts(db, "user-author", "Title", "Body", { id: "post-1", },);
},);

describe("blog comments", () => {
  test("createComment round-trips the comment row", async () => {
    const comment = await createComment(db, {
      post_id: "post-1",
      author_id: "actor-commenter",
      body: "First!",
    },);
    expect(comment.post_id,).toBe("post-1",);
    expect(comment.author_id,).toBe("actor-commenter",);
    expect(comment.body,).toBe("First!",);
    expect(comment.status,).toBe("visible",);
    expect(comment.parent_comment_id,).toBeNull();
    expect(typeof comment.id,).toBe("string",);
  });

  test("createComment with a parent links the reply", async () => {
    const parent = await createComment(db, {
      post_id: "post-1",
      author_id: "actor-commenter",
      body: "Parent",
    },);
    const reply = await createComment(db, {
      post_id: "post-1",
      author_id: "actor-commenter",
      body: "Reply",
      parent_comment_id: parent.id,
    },);
    expect(reply.parent_comment_id,).toBe(parent.id,);
  });

  test("comment by another author notifies the post author by name", async () => {
    await createComment(db, {
      post_id: "post-1",
      author_id: "actor-commenter",
      body: "Nice post",
    },);
    const rows = await db
      .selectFrom("notifications",)
      .selectAll()
      .where("user_id", "=", "user-author",)
      .execute();
    expect(rows.length,).toBe(1,);
    expect(rows[0]?.type,).toBe("blog_comment",);
    expect(rows[0]?.title,).toBe("Commenter commented on your post",);
    expect(rows[0]?.data ?? "",).toContain("post-1",);
  });

  test("comment by the post author sends no notification", async () => {
    await createComment(db, {
      post_id: "post-1",
      author_id: "user-author",
      body: "My own note",
    },);
    const rows = await db
      .selectFrom("notifications",)
      .selectAll()
      .where("user_id", "=", "user-author",)
      .execute();
    expect(rows,).toEqual([],);
  });

  test("comment by an unknown actor falls back to Someone", async () => {
    await createComment(db, {
      post_id: "post-1",
      author_id: "actor-ghost",
      body: "Boo",
    },);
    const rows = await db
      .selectFrom("notifications",)
      .selectAll()
      .where("user_id", "=", "user-author",)
      .execute();
    expect(rows.length,).toBe(1,);
    expect(rows[0]?.title,).toBe("Someone commented on your post",);
  });

  test("listComments returns empty list for a post with no comments", async () => {
    expect(await listComments(db, "post-1",),).toEqual([],);
  });

  test("listComments returns every visible comment", async () => {
    await createComment(db, { post_id: "post-1", author_id: "user-author", body: "One", },);
    await createComment(db, { post_id: "post-1", author_id: "user-author", body: "Two", },);
    const rows = await listComments(db, "post-1",);
    expect(rows.map((c,) => c.body).toSorted(),).toEqual(["One", "Two",],);
  });

  test("listComments honors limit and offset", async () => {
    await createComment(db, { post_id: "post-1", author_id: "user-author", body: "One", },);
    await createComment(db, { post_id: "post-1", author_id: "user-author", body: "Two", },);
    await createComment(db, { post_id: "post-1", author_id: "user-author", body: "Three", },);
    expect((await listComments(db, "post-1", { limit: 2, },)).length,).toBe(2,);
    expect((await listComments(db, "post-1", { limit: 2, offset: 2, },)).length,).toBe(1,);
  });

  test("listComments excludes deleted comments but keeps hidden ones", async () => {
    const gone = await createComment(db, {
      post_id: "post-1",
      author_id: "user-author",
      body: "Gone",
    },);
    const flagged = await createComment(db, {
      post_id: "post-1",
      author_id: "user-author",
      body: "Flagged",
    },);
    expect(await moderateComment(db, gone.id, "deleted",),).toBeTrue();
    expect(await moderateComment(db, flagged.id, "hidden",),).toBeTrue();
    const rows = await listComments(db, "post-1",);
    expect(rows.map((c,) => c.body),).toEqual(["Flagged",],);
  });

  test("getComment finds a comment and misses unknown and deleted ones", async () => {
    const comment = await createComment(db, {
      post_id: "post-1",
      author_id: "user-author",
      body: "Hello",
    },);
    expect((await getComment(db, comment.id,))?.body,).toBe("Hello",);
    expect(await getComment(db, "comment-missing",),).toBeUndefined();
    await moderateComment(db, comment.id, "deleted",);
    expect(await getComment(db, comment.id,),).toBeUndefined();
  });

  test("moderateComment on a missing comment returns false", async () => {
    expect(await moderateComment(db, "comment-missing", "hidden",),).toBeFalse();
  });

  test("listCommentsThreaded nests replies under parents", async () => {
    const rootA = await createComment(db, {
      post_id: "post-1",
      author_id: "user-author",
      body: "Root A",
    },);
    await createComment(db, { post_id: "post-1", author_id: "user-author", body: "Root B", },);
    const reply = await createComment(db, {
      post_id: "post-1",
      author_id: "user-author",
      body: "Reply to A",
      parent_comment_id: rootA.id,
    },);
    await createComment(db, {
      post_id: "post-1",
      author_id: "user-author",
      body: "Nested",
      parent_comment_id: reply.id,
    },);
    const tree = await listCommentsThreaded(db, "post-1",);
    expect(tree.map((c,) => c.body).toSorted(),).toEqual(["Root A", "Root B",],);
    const nodeA = tree.find((c,) => c.body === "Root A");
    expect(nodeA?.children.map((c,) => c.body),).toEqual(["Reply to A",],);
    expect(nodeA?.children[0]?.children.map((c,) => c.body),).toEqual(["Nested",],);
    expect(tree.find((c,) => c.body === "Root B")?.children,).toEqual([],);
  });

  test("listCommentsThreaded excludes deleted comments", async () => {
    const comment = await createComment(db, {
      post_id: "post-1",
      author_id: "user-author",
      body: "Doomed",
    },);
    await moderateComment(db, comment.id, "deleted",);
    expect(await listCommentsThreaded(db, "post-1",),).toEqual([],);
  });
});
