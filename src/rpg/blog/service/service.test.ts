// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../../test-utils/insert-helpers";
import { BlogService, } from "./index";

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
  await insertUsers(db, "follower", "Follower", { id: "user-follower", },);
  await insertActors(db, "Commenter", { id: "actor-commenter", },);
},);

describe("BlogService posts facade", () => {
  test("covers create/get/list/update/increment/delete", async () => {
    const svc = new BlogService(db,);
    const row = await svc.createPost({
      author_id: "user-author",
      title: "Facade",
      body: "body",
      tags: ["t",],
    },);
    expect(row.title,).toBe("Facade",);

    const fetched = await svc.getPost(row.id,);
    expect(fetched?.title,).toBe("Facade",);
    expect(fetched?.tags,).toEqual(["t",],);
    expect(await svc.getPost("post-missing",),).toBeUndefined();

    expect((await svc.listPosts({ author_id: "user-author", },)).length,).toBe(1,);

    const updated = await svc.updatePost(row.id, { title: "Facade2", }, "user-author",);
    expect(updated?.title,).toBe("Facade2",);
    expect(await svc.updatePost("post-missing", { title: "x", }, "user-author",),).toBeUndefined();

    await svc.incrementViewCount(row.id,);
    expect((await svc.getPost(row.id,))?.view_count,).toBe(1,);

    expect(await svc.deletePost(row.id, "user-author",),).toBeTrue();
    expect(await svc.getPost(row.id,),).toBeUndefined();
    expect(await svc.deletePost(row.id, "user-author",),).toBeFalse();
  });
});

describe("BlogService comments facade", () => {
  test("covers create/get/list/threaded/moderate", async () => {
    const svc = new BlogService(db,);
    const post = await svc.createPost({
      author_id: "user-author",
      title: "P",
      body: "b",
    },);

    const comment = await svc.createComment({
      post_id: post.id,
      author_id: "actor-commenter",
      body: "Hi",
    },);
    expect(comment.body,).toBe("Hi",);
    expect((await svc.getComment(comment.id,))?.body,).toBe("Hi",);
    expect(await svc.getComment("comment-missing",),).toBeUndefined();

    expect((await svc.listComments(post.id,)).length,).toBe(1,);
    const tree = await svc.listCommentsThreaded(post.id,);
    expect(tree.length,).toBe(1,);
    expect(tree[0]?.children,).toEqual([],);

    expect(await svc.moderateComment(comment.id, "hidden", { userId: "user-author", role: "user", },),).toBeTrue();
    expect((await svc.getComment(comment.id,))?.status,).toBe("hidden",);
    expect(await svc.moderateComment("comment-missing", "hidden", { userId: "user-author", role: "user", },),)
      .toBeFalse();
  });

  test("threaded nests a reply", async () => {
    const svc = new BlogService(db,);
    const post = await svc.createPost({
      author_id: "user-author",
      title: "P",
      body: "b",
    },);
    const parent = await svc.createComment({
      post_id: post.id,
      author_id: "actor-commenter",
      body: "Parent",
    },);
    await svc.createComment({
      post_id: post.id,
      author_id: "actor-commenter",
      body: "Reply",
      parent_comment_id: parent.id,
    },);
    const tree = await svc.listCommentsThreaded(post.id,);
    expect(tree.length,).toBe(1,);
    expect(tree[0]?.children.map((c,) => c.body),).toEqual(["Reply",],);
  });
});

describe("BlogService follows + RAG facade", () => {
  test("covers follow/unfollow/getFollowers/isFollowing/getFollowStatus", async () => {
    const svc = new BlogService(db,);
    expect(await svc.isFollowing("user-follower", "user-author",),).toBeFalse();
    expect(await svc.getFollowStatus("user-follower", "user-author",),).toEqual({
      following: false,
    },);

    const row = await svc.follow("user-follower", "user-author",);
    expect(row.follower_id,).toBe("user-follower",);
    expect(row.author_id,).toBe("user-author",);
    expect(await svc.isFollowing("user-follower", "user-author",),).toBeTrue();
    expect(await svc.getFollowStatus("user-follower", "user-author",),).toEqual({
      following: true,
    },);
    expect(await svc.getFollowers("user-author",),).toEqual(["user-follower",],);

    expect(await svc.unfollow("user-follower", "user-author",),).toBeTrue();
    expect(await svc.isFollowing("user-follower", "user-author",),).toBeFalse();
    expect(await svc.getFollowers("user-author",),).toEqual([],);
    expect(await svc.unfollow("user-follower", "user-author",),).toBeFalse();
  });

  test("covers addRAGSource/getRAGSources round-trip", async () => {
    const svc = new BlogService(db,);
    const post = await svc.createPost({
      author_id: "user-author",
      title: "P",
      body: "b",
    },);
    expect(await svc.getRAGSources(post.id,),).toEqual([],);

    const row = await svc.addRAGSource(post.id, {
      source_type: "external_web",
      uri: "https://example.com/lore",
      title: "Lore",
      relevance_score: 0.8,
      snippet: "dragons",
    },);
    expect(row.post_id,).toBe(post.id,);
    expect(row.uri,).toBe("https://example.com/lore",);

    const rows = await svc.getRAGSources(post.id,);
    expect(rows.length,).toBe(1,);
    expect(rows[0]?.title,).toBe("Lore",);
  });
});
