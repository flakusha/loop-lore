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
import { blogPostRoutes, } from "./posts";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;
const AUTHOR = "post-route-author";
const READER = "post-route-reader";

/**
 * @param userId
 * @param userRole
 */
function makeApp(userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-blog-posts", },)
    .derive(() => ({ userId, userRole, }))
    .use(blogPostRoutes({ database: db, }, "/api",),) as unknown as Elysia;
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
    title: "Route seed",
    body: "Route seed body",
    visibility,
  },);
  if (status !== "draft") {
    await svc.updatePost(post.id, { status, }, AUTHOR, false,);
  }
  return post.id;
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
  await insertUsers(db, "route-author", "Author", { id: AUTHOR, },);
  await insertUsers(db, "route-reader", "Reader", { id: READER, },);
},);

describe("GET /api/blog/posts/:id (BUG-blog-post-get-bypasses-visibility-policy)", () => {
  test("requires authentication (401)", async () => {
    const id = await seedPost("public", "published",);
    const res = await makeApp(null, null,).handle(new Request(`http://localhost/api/blog/posts/${id}`,),);
    expect(res.status,).toBe(401,);
  });

  test("serves a public published post to any authenticated caller", async () => {
    const id = await seedPost("public", "published",);
    const res = await makeApp(READER, "user",).handle(new Request(`http://localhost/api/blog/posts/${id}`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { post?: { id: string } };
    expect(body.post?.id,).toBe(id,);
  });

  test("hides a private post from another user with 404", async () => {
    const id = await seedPost("private", "published",);
    const res = await makeApp(READER, "user",).handle(new Request(`http://localhost/api/blog/posts/${id}`,),);
    expect(res.status,).toBe(404,);
  });

  test("hides a followers-only post from a non-follower with 404", async () => {
    const id = await seedPost("followers", "published",);
    const res = await makeApp(READER, "user",).handle(new Request(`http://localhost/api/blog/posts/${id}`,),);
    expect(res.status,).toBe(404,);
  });

  test("hides an unpublished draft from another user with 404", async () => {
    const id = await seedPost("public", "draft",);
    const res = await makeApp(READER, "user",).handle(new Request(`http://localhost/api/blog/posts/${id}`,),);
    expect(res.status,).toBe(404,);
  });

  test("serves the author their own private draft", async () => {
    const id = await seedPost("private", "draft",);
    const res = await makeApp(AUTHOR, "user",).handle(new Request(`http://localhost/api/blog/posts/${id}`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { post?: { id: string } };
    expect(body.post?.id,).toBe(id,);
  });

  test("serves a private post to an admin", async () => {
    const id = await seedPost("private", "published",);
    const res = await makeApp(READER, "admin",).handle(new Request(`http://localhost/api/blog/posts/${id}`,),);
    expect(res.status,).toBe(200,);
  });

  test("returns 404 for an unknown id", async () => {
    const res = await makeApp(READER, "user",).handle(new Request("http://localhost/api/blog/posts/nope",),);
    expect(res.status,).toBe(404,);
  });
});

describe("POST /api/blog/posts", () => {
  test("requires authentication (401)", async () => {
    const res = await makeApp(null, null,).handle(
      new Request("http://localhost/api/blog/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "T", body: "B", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("creates a draft post for the authenticated author", async () => {
    const res = await makeApp(AUTHOR, "user",).handle(
      new Request("http://localhost/api/blog/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "Created", body: "Created body", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      post?: { id: string; title: string; author_id: string; visibility: string; status: string };
    };
    expect(body.post?.title,).toBe("Created",);
    expect(body.post?.author_id,).toBe(AUTHOR,);
    expect(body.post?.visibility,).toBe("public",);
    expect(body.post?.status,).toBe("draft",);
  });

  test("rejects an empty title with 422", async () => {
    const res = await makeApp(AUTHOR, "user",).handle(
      new Request("http://localhost/api/blog/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "", body: "B", },),
      },),
    );
    expect(res.status,).toBe(422,);
  });
});

describe("GET /api/blog/posts", () => {
  test("requires authentication (401)", async () => {
    const res = await makeApp(null, null,).handle(new Request("http://localhost/api/blog/posts",),);
    expect(res.status,).toBe(401,);
  });

  test("lists posts for an authenticated caller", async () => {
    const first = await seedPost("public", "published",);
    const second = await seedPost("public", "published",);
    const res = await makeApp(READER, "user",).handle(new Request("http://localhost/api/blog/posts",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { posts?: { id: string }[]; count?: number };
    expect(body.count,).toBe(2,);
    const ids = Array.from(body.posts ?? [], (p,) => p.id,);
    expect(ids,).toContain(first,);
    expect(ids,).toContain(second,);
  });
});

describe("PATCH /api/blog/posts/:id", () => {
  test("requires authentication (401)", async () => {
    const id = await seedPost("public", "draft",);
    const res = await makeApp(null, null,).handle(
      new Request(`http://localhost/api/blog/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "New", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("lets the author update and publish their post", async () => {
    const id = await seedPost("public", "draft",);
    const res = await makeApp(AUTHOR, "user",).handle(
      new Request(`http://localhost/api/blog/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "Renamed", status: "published", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { post?: { title: string; status: string; published_at: string | null } };
    expect(body.post?.title,).toBe("Renamed",);
    expect(body.post?.status,).toBe("published",);
    expect(body.post?.published_at,).toBeTypeOf("string",);
  });

  test("rejects a non-author with 404", async () => {
    const id = await seedPost("public", "draft",);
    const res = await makeApp(READER, "user",).handle(
      new Request(`http://localhost/api/blog/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "Hax", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("lets an admin update another author's post", async () => {
    const id = await seedPost("public", "draft",);
    const res = await makeApp(READER, "admin",).handle(
      new Request(`http://localhost/api/blog/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "Admined", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { post?: { title: string } };
    expect(body.post?.title,).toBe("Admined",);
  });

  test("returns 404 for an unknown id", async () => {
    const res = await makeApp(AUTHOR, "user",).handle(
      new Request("http://localhost/api/blog/posts/11111111-1111-4111-8111-111111111111", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "New", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });
});

describe("DELETE /api/blog/posts/:id", () => {
  test("requires authentication (401)", async () => {
    const id = await seedPost("public", "draft",);
    const res = await makeApp(null, null,).handle(
      new Request(`http://localhost/api/blog/posts/${id}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(401,);
  });

  test("lets the author delete their post", async () => {
    const id = await seedPost("public", "draft",);
    const res = await makeApp(AUTHOR, "user",).handle(
      new Request(`http://localhost/api/blog/posts/${id}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(200,);
    const svc = new BlogService(db,);
    expect(await svc.getPost(id,),).toBeUndefined();
  });

  test("rejects a non-author with 404 and keeps the post", async () => {
    const id = await seedPost("public", "draft",);
    const res = await makeApp(READER, "user",).handle(
      new Request(`http://localhost/api/blog/posts/${id}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
    const svc = new BlogService(db,);
    expect((await svc.getPost(id,))?.id,).toBe(id,);
  });

  test("returns 404 for an unknown id", async () => {
    const res = await makeApp(AUTHOR, "user",).handle(
      new Request("http://localhost/api/blog/posts/11111111-1111-4111-8111-111111111111", { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  });
});
