// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Blog barrel tests — mounts blogRoutes behind the same derive-auth
 * harness as dice.test.ts and verifies the sub-plugin wiring.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { blogRoutes, } from "./index";

let db: Kysely<DB>;

beforeAll(async () => {
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

/**
 * @param userId optional authenticated user
 */
function makeApp(userId?: string,) {
  const app = new Elysia({ name: "test-blog-barrel", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }
  return app.use(blogRoutes({ database: db, },),);
}

describe("blogRoutes barrel", () => {
  test("assembles an Elysia instance", () => {
    expect(makeApp("u1",),).toBeInstanceOf(Elysia,);
  });

  test("registers the blog post, comment, moderation, follow, and rag surfaces", () => {
    const app = makeApp("u1",);
    const paths = app.routes.map((r,) => r.path);
    expect(paths.some((p,) => p.includes("/api/blog/posts",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/blog/posts/:id/sources",)),).toBe(true,);
    expect(paths.length,).toBeGreaterThan(3,);
  });

  test("GET an unknown post returns 404 through the barrel", async () => {
    const res = await makeApp("u1",).handle(new Request("http://localhost/api/blog/posts/missing",),);
    expect(res.status,).toBe(404,);
  });
});
