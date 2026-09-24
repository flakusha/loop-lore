// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { BlogService, } from "../../rpg/blog/service.js";
import type { BlogPostStatus, BlogPostVisibility, } from "../../rpg/blog/service/types";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { blogCommentRoutes, } from "./comments";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;
const AUTHOR = "comment-route-author";
const READER = "comment-route-reader";

/**
 * @param userId
 * @param userRole
 */
function makeApp(userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-blog-comments", },)
    .derive(() => ({ userId, userRole, }))
    .use(blogCommentRoutes({ database: db, }, "/api",),) as unknown as Elysia;
}

/**
 * Seed a post authored by AUTHOR with an explicit visibility and status.
 * @param visibility
 * @param status
 * @returns the seeded post id
 */
async function seedPost(visibility: BlogPostVisibility, status: BlogPostStatus,): Promise<string> {
  const svc = new BlogService(db,);
  const post = await svc.createPost({
    author_id: AUTHOR,
    title: "Comment route seed",
    body: "Comment route seed body",
    visibility,
  },);
  if (status !== "draft") {
    await svc.updatePost(post.id, { status, }, AUTHOR, false,);
  }
  return post.id;
}

/**
 * POST a comment as the given caller.
 * @param userId
 * @param userRole
 * @param postId
 * @param bodyText
 */
function postComment(
  userId: string | null,
  userRole: string | null,
  postId: string,
  bodyText = "Nice post",
): Promise<Response> {
  return makeApp(userId, userRole,).handle(
    new Request(`http://localhost/api/blog/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify({ body: bodyText, },),
    },),
  );
}

beforeAll(async () => {
  const ctx = await createTestDb();
  db = ctx.db;
  sqlite = ctx.sqlite;
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "comment-route-author", "Author", { id: AUTHOR, },);
  await insertUsers(db, "comment-route-reader", "Reader", { id: READER, },);
},);

describe("POST /api/blog/posts/:id/comments (BUG-blog-comments-post-accepts-non-public-posts)", () => {
  test("requires authentication (401)", async () => {
    const id = await seedPost("public", "published",);
    const res = await postComment(null, null, id,);
    expect(res.status,).toBe(401,);
  });

  test("accepts a comment on a public published post", async () => {
    const id = await seedPost("public", "published",);
    const res = await postComment(READER, "user", id,);
    expect(res.status,).toBe(200,);
    const svc = new BlogService(db,);
    const thread = await svc.listCommentsThreaded(id, {},);
    expect(thread,).toHaveLength(1,);
    expect(thread[0]?.body,).toBe("Nice post",);
    expect(thread[0]?.author_id,).toBe(READER,);
  });

  test("hides a private post from another user with 404 and stores nothing", async () => {
    const id = await seedPost("private", "published",);
    const res = await postComment(READER, "user", id,);
    expect(res.status,).toBe(404,);
    const svc = new BlogService(db,);
    expect(await svc.listCommentsThreaded(id, {},),).toEqual([],);
  });

  test("hides a followers-only post from a non-follower with 404", async () => {
    const id = await seedPost("followers", "published",);
    const res = await postComment(READER, "user", id,);
    expect(res.status,).toBe(404,);
  });

  test("hides an unpublished draft from another user with 404", async () => {
    const id = await seedPost("public", "draft",);
    const res = await postComment(READER, "user", id,);
    expect(res.status,).toBe(404,);
  });

  test("denial is indistinguishable from a missing post (no existence oracle)", async () => {
    const priv = await seedPost("private", "published",);
    const denied = await postComment(READER, "user", priv,);
    const missing = await postComment(READER, "user", "11111111-1111-4111-8111-111111111111",);
    expect(denied.status,).toBe(missing.status,);
    expect(denied.status,).toBe(404,);
  });

  test("lets the author comment on their own private draft", async () => {
    const id = await seedPost("private", "draft",);
    const res = await postComment(AUTHOR, "user", id,);
    expect(res.status,).toBe(200,);
  });

  test("lets an admin comment on a private post", async () => {
    const id = await seedPost("private", "published",);
    const res = await postComment(READER, "admin", id,);
    expect(res.status,).toBe(200,);
  });
});

describe("GET /api/blog/posts/:id/comments", () => {
  test("requires authentication (401)", async () => {
    const id = await seedPost("public", "published",);
    const res = await makeApp(null, null,).handle(
      new Request(`http://localhost/api/blog/posts/${id}/comments`,),
    );
    expect(res.status,).toBe(401,);
  });

  test("serves the threaded comments of a readable post", async () => {
    const id = await seedPost("public", "published",);
    const svc = new BlogService(db,);
    const root = await svc.createComment({
      post_id: id,
      author_id: AUTHOR,
      body: "root comment",
    },);
    await svc.createComment({
      post_id: id,
      author_id: READER,
      body: "a reply",
      parent_comment_id: root.id,
    },);

    const res = await makeApp(READER, "user",).handle(
      new Request(`http://localhost/api/blog/posts/${id}/comments`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      comments?: { id: string; children: { id: string }[] }[];
      count?: number;
    };
    expect(body.count,).toBe(1,);
    expect(body.comments?.[0]?.id,).toBe(root.id,);
    expect(body.comments?.[0]?.children,).toHaveLength(1,);
  });

  test("hides the thread of a non-public post with 404", async () => {
    const id = await seedPost("private", "published",);
    const svc = new BlogService(db,);
    await svc.createComment({ post_id: id, author_id: AUTHOR, body: "secret thread", },);

    const res = await makeApp(READER, "user",).handle(
      new Request(`http://localhost/api/blog/posts/${id}/comments`,),
    );
    expect(res.status,).toBe(404,);
  });
});

describe("GET /api/blog/posts/:id/comments/:commentId", () => {
  test("serves a comment on a readable post", async () => {
    const id = await seedPost("public", "published",);
    const svc = new BlogService(db,);
    const comment = await svc.createComment({
      post_id: id,
      author_id: READER,
      body: "single comment",
    },);

    const res = await makeApp(READER, "user",).handle(
      new Request(`http://localhost/api/blog/posts/${id}/comments/${comment.id}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { comment?: { id: string; body: string } };
    expect(body.comment?.id,).toBe(comment.id,);
    expect(body.comment?.body,).toBe("single comment",);
  });

  test("hides comments on a non-public post with 404 (policy precedes lookup)", async () => {
    const id = await seedPost("private", "published",);
    const svc = new BlogService(db,);
    const comment = await svc.createComment({ post_id: id, author_id: AUTHOR, body: "hidden", },);

    const res = await makeApp(READER, "user",).handle(
      new Request(`http://localhost/api/blog/posts/${id}/comments/${comment.id}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("returns 404 for an unknown comment id on a readable post", async () => {
    const id = await seedPost("public", "published",);
    const res = await makeApp(READER, "user",).handle(
      new Request(`http://localhost/api/blog/posts/${id}/comments/11111111-1111-4111-8111-111111111111`,),
    );
    expect(res.status,).toBe(404,);
  });
});
