// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { BlogService, } from "../../rpg/blog/service.js";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { blogFollowRoutes, } from "./follows";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;
const AUTHOR = "follow-route-author";
const FOLLOWER = "follow-route-follower";
const OTHER = "follow-route-other";

/**
 * @param userId
 * @param userRole
 */
function makeApp(userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-blog-follows", },)
    .derive(() => ({ userId, userRole, }))
    .use(blogFollowRoutes({ database: db, }, "/api",),) as unknown as Elysia;
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
  await insertUsers(db, "follow-author", "Author", { id: AUTHOR, },);
  await insertUsers(db, "follow-follower", "Follower", { id: FOLLOWER, },);
  await insertUsers(db, "follow-other", "Other", { id: OTHER, },);
  const svc = new BlogService(db,);
  await svc.follow(FOLLOWER, AUTHOR,);
},);

describe("GET /api/blog/authors/:authorId/followers (BUG-blog-followers-list-no-auth-reveals-follower-ids)", () => {
  test("requires authentication (401)", async () => {
    const res = await makeApp(null, null,).handle(
      new Request(`http://localhost/api/blog/authors/${AUTHOR}/followers`,),
    );
    expect(res.status,).toBe(401,);
  });

  test("serves the author their own follower list", async () => {
    const res = await makeApp(AUTHOR, "user",).handle(
      new Request(`http://localhost/api/blog/authors/${AUTHOR}/followers`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { followers?: string[]; count?: number };
    expect(body.followers,).toEqual([FOLLOWER,],);
    expect(body.count,).toBe(1,);
  });

  test("rejects another user with 403", async () => {
    const res = await makeApp(OTHER, "user",).handle(
      new Request(`http://localhost/api/blog/authors/${AUTHOR}/followers`,),
    );
    expect(res.status,).toBe(403,);
  });

  test("serves an admin the follower list", async () => {
    const res = await makeApp(OTHER, "admin",).handle(
      new Request(`http://localhost/api/blog/authors/${AUTHOR}/followers`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { followers?: string[] };
    expect(body.followers,).toEqual([FOLLOWER,],);
  });
});

describe("POST /api/blog/follow/:authorId", () => {
  test("requires authentication (401)", async () => {
    const res = await makeApp(null, null,).handle(
      new Request(`http://localhost/api/blog/follow/${AUTHOR}`, { method: "POST", },),
    );
    expect(res.status,).toBe(401,);
  });

  test("follows an author and is reflected in follow status", async () => {
    const res = await makeApp(OTHER, "user",).handle(
      new Request(`http://localhost/api/blog/follow/${AUTHOR}`, { method: "POST", },),
    );
    expect(res.status,).toBe(200,);
    const status = await makeApp(OTHER, "user",).handle(
      new Request(`http://localhost/api/blog/follow/${AUTHOR}/status`,),
    );
    expect(status.status,).toBe(200,);
    const body = (await status.json()) as { following?: boolean };
    expect(body.following,).toBe(true,);
  });
});

describe("GET /api/blog/follow/:authorId/status", () => {
  test("requires authentication (401)", async () => {
    const res = await makeApp(null, null,).handle(
      new Request(`http://localhost/api/blog/follow/${AUTHOR}/status`,),
    );
    expect(res.status,).toBe(401,);
  });

  test("reports following false for a non-follower", async () => {
    const res = await makeApp(OTHER, "user",).handle(
      new Request(`http://localhost/api/blog/follow/${AUTHOR}/status`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { following?: boolean };
    expect(body.following,).toBe(false,);
  });
});

describe("DELETE /api/blog/follow/:authorId", () => {
  test("requires authentication (401)", async () => {
    const res = await makeApp(null, null,).handle(
      new Request(`http://localhost/api/blog/follow/${AUTHOR}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(401,);
  });

  test("unfollows an author", async () => {
    const res = await makeApp(FOLLOWER, "user",).handle(
      new Request(`http://localhost/api/blog/follow/${AUTHOR}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(200,);
    const svc = new BlogService(db,);
    expect(await svc.isFollowing(FOLLOWER, AUTHOR,),).toBeFalse();
  });
});
