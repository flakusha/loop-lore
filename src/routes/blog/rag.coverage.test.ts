// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route-level coverage for `blogRagRoutes`.
 *
 * `service.test.ts` covers the RAG-source service methods directly, so this
 * plugin had no test at all: the admin gate, the id/body plumbing and the
 * response shape were unexercised. These go through HTTP so a dropped
 * `admin.settings` check or a wrong status fails here.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { insertBlogPosts, insertBlogRagSources, insertUsers, } from "../../test-utils/insert-helpers";
import { blogRagRoutes, } from "./rag";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;
const ADMIN = "rag-route-admin";
const USER = "rag-route-user";

const STRANGER = "rag-route-stranger";
let postId: string;

/**
 * @param userId
 * @param userRole
 */
function app(userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-blog-rag", },)
    .derive(() => ({ userId, userRole, t: undefined, }))
    .use(blogRagRoutes({ database: db, }, "/api",),) as unknown as Elysia;
}

/**
 * @param userId
 * @param userRole
 * @param body
 */
function postSource(userId: string, userRole: string, body: unknown,): Promise<Response> {
  return app(userId, userRole,).handle(
    new Request(`http://localhost/api/blog/posts/${postId}/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/**
 * @param visibility
 * @param status
 * @param authorId
 */
async function seedPost(visibility: string, status: string, authorId: string,): Promise<string> {
  return insertBlogPosts(db, authorId, "Gated Post", "Body", {
    visibility,
    status,
  },);
}

/**
 * @param userId
 * @param userRole
 * @param targetId
 */
function getSources(userId: string | null, userRole: string | null, targetId: string,): Promise<Response> {
  return app(userId, userRole,).handle(
    new Request(`http://localhost/api/blog/posts/${targetId}/sources`,),
  );
}

beforeAll(async () => {
  const ctx = await createTestDb();
  db = ctx.db;
  sqlite = ctx.sqlite;
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "rag-admin", "Admin", { id: ADMIN, },);
  await insertUsers(db, "rag-user", "User", { id: USER, },);

  await insertUsers(db, "rag-stranger", "Stranger", { id: STRANGER, },);
  postId = await insertBlogPosts(db, ADMIN, "Lore Post", "Body", {
    id: "rag-route-post",
    visibility: "public",
    status: "published",
  },);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

describe("blog RAG source routes", () => {
  test("GET sources is empty before any source is added", async () => {
    const res = await app(USER, "user",).handle(
      new Request(`http://localhost/api/blog/posts/${postId}/sources`,),
    );

    expect(res.status,).toBe(200,);
    const body: { success: boolean; sources: unknown[]; count: number } = await res.json();
    expect(body.count,).toBe(0,);
    expect(body.sources,).toEqual([],);
  });

  test("POST sources is 403 without admin.settings and 200 with it", async () => {
    const denied = await postSource(USER, "user", {
      source_type: "external_web",
      uri: "https://example.com/lore",
      title: "Lore",
    },);

    expect(denied.status,).toBe(403,);

    const allowed = await postSource(ADMIN, "admin", {
      source_type: "external_web",
      uri: "https://example.com/lore",
      title: "Lore",
      relevance_score: 0.8,
      snippet: "a snippet",
    },);

    expect(allowed.status,).toBe(200,);
    const body: { success: boolean; source: { uri: string; relevance_score: number } } = await allowed.json();
    expect(body.success,).toBe(true,);
    expect(body.source.uri,).toBe("https://example.com/lore",);
  });

  test("POST sources defaults relevance_score and snippet when omitted", async () => {
    const res = await postSource(ADMIN, "admin", {
      source_type: "internal_rag",
      uri: "memory://short",
      title: "Short",
    },);

    expect(res.status,).toBe(200,);
    const body: { source: { relevance_score: number; snippet: string } } = await res.json();
    expect(body.source.relevance_score,).toBe(0,);
    expect(body.source.snippet,).toBe("",);
  });

  test("GET sources lists what POST added, ordered by relevance descending", async () => {
    await postSource(ADMIN, "admin", { source_type: "external_web", uri: "https://a.example", title: "Low", },);
    await postSource(ADMIN, "admin", {
      source_type: "internal_rag",
      uri: "memory://high",
      title: "High",
      relevance_score: 0.9,
    },);

    const res = await app(USER, "user",).handle(
      new Request(`http://localhost/api/blog/posts/${postId}/sources`,),
    );

    expect(res.status,).toBe(200,);
    const body: { count: number; sources: { title: string }[] } = await res.json();
    expect(body.count,).toBe(2,);
    expect(body.sources.map((s,) => s.title),).toEqual(["High", "Low",],);
  });
});

describe("GET sources read policy (BUG-blog-rag-sources-leaks-private-post-data)", () => {
  const SECRET_URI = "https://secret.example/plan-of-attack";

  /**
   * @param authorId
   * @param visibility
   * @param status
   */
  async function privatePostWithSecret(
    authorId: string,
    visibility: string,
    status: string,
  ): Promise<string> {
    const id = await seedPost(visibility, status, authorId,);
    await insertBlogRagSources(db, id, "external_web", SECRET_URI, "Secret",);
    return id;
  }

  test("anonymous caller gets 401, not the private source list", async () => {
    const target = await privatePostWithSecret(ADMIN, "private", "draft",);

    const res = await getSources(null, null, target,);

    expect(res.status,).toBe(401,);
    const body: { error: string; code: string } = await res.json();
    expect(body.code,).toBe("UNAUTHORIZED",);
    expect(body.error,).toBe("Unauthorized",);
    expect(JSON.stringify(body,),).not.toContain(SECRET_URI,);
  });

  test("a stranger gets 404 and no trace of the private source uri", async () => {
    const target = await privatePostWithSecret(ADMIN, "private", "draft",);

    const res = await getSources(STRANGER, "user", target,);

    expect(res.status,).toBe(404,);
    const body: { error: string; code: string } = await res.json();
    expect(body.code,).toBe("NOT_FOUND",);
    expect(body.error,).toBe("errors.notFound",);
    expect(JSON.stringify(body,),).not.toContain(SECRET_URI,);
  });

  test("a stranger gets 404 on a public-but-unpublished draft too", async () => {
    const target = await privatePostWithSecret(ADMIN, "public", "draft",);

    const res = await getSources(STRANGER, "user", target,);

    expect(res.status,).toBe(404,);
    const body: { error: string; code: string } = await res.json();
    expect(body.code,).toBe("NOT_FOUND",);
    expect(JSON.stringify(body,),).not.toContain(SECRET_URI,);
  });

  test("the author reads their own private draft's sources", async () => {
    const target = await privatePostWithSecret(ADMIN, "private", "draft",);

    const res = await getSources(ADMIN, "user", target,);

    expect(res.status,).toBe(200,);
    const body: { count: number; sources: { uri: string }[] } = await res.json();
    expect(body.count,).toBe(1,);
    expect(body.sources[0]?.uri,).toBe(SECRET_URI,);
  });

  test("an admin with admin.settings reads a private post's sources", async () => {
    const target = await privatePostWithSecret(ADMIN, "private", "draft",);

    const res = await getSources(STRANGER, "admin", target,);

    expect(res.status,).toBe(200,);
    const body: { count: number; sources: { uri: string }[] } = await res.json();
    expect(body.count,).toBe(1,);
    expect(body.sources[0]?.uri,).toBe(SECRET_URI,);
  });

  test("a logged-in stranger reads a public published post's sources", async () => {
    const target = await privatePostWithSecret(ADMIN, "public", "published",);

    const res = await getSources(STRANGER, "user", target,);

    expect(res.status,).toBe(200,);
    const body: { count: number; sources: { uri: string }[] } = await res.json();
    expect(body.count,).toBe(1,);
    expect(body.sources[0]?.uri,).toBe(SECRET_URI,);
  });

  test("an unknown post id is 404 for an authenticated caller", async () => {
    const res = await getSources(STRANGER, "user", "11111111-1111-4111-8111-111111111111",);

    expect(res.status,).toBe(404,);
    const body: { code: string } = await res.json();
    expect(body.code,).toBe("NOT_FOUND",);
  });
});
