// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW barrel tests — mounts nsfwRoutes behind the same derive-auth
 * harness as dice.test.ts and verifies the sub-plugin wiring.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { nsfwRoutes, } from "./index";

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
  const app = new Elysia({ name: "test-nsfw-barrel", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }
  return app.use(nsfwRoutes({ database: db, config: {} as never, },),);
}

describe("nsfwRoutes barrel", () => {
  test("assembles an Elysia instance", () => {
    expect(makeApp("u1",),).toBeInstanceOf(Elysia,);
  });

  test("registers the intimacy, seduction, body, encounter, fantasy, and location surfaces", () => {
    const paths = makeApp("u1",).routes.map((r,) => r.path);
    expect(paths.some((p,) => p.includes("/api/nsfw/intimacy",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/seduction",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/body",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/encounter",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/fantas",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/location",)),).toBe(true,);
  });

  test("intimacy lookup without auth returns 401 through the barrel", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/intimacy/actor-1/actor-2",),
    );
    expect(res.status,).toBe(401,);
  });
});
