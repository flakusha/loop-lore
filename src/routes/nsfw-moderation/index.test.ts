// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW-moderation barrel tests — mounts nsfwModerationRoutes behind the
 * same derive-auth harness as dice.test.ts and verifies the wiring.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { nsfwModerationRoutes, } from "./index";

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
  const app = new Elysia({ name: "test-nsfw-moderation-barrel", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }
  return app.use(nsfwModerationRoutes({ database: db, },),);
}

describe("nsfwModerationRoutes barrel", () => {
  test("assembles an Elysia instance", () => {
    expect(makeApp("u1",),).toBeInstanceOf(Elysia,);
  });

  test("registers preferences, actions, flags, audit, overrides, and appeals surfaces", () => {
    const paths = makeApp("u1",).routes.map((r,) => r.path);
    expect(paths.some((p,) => p.includes("/api/nsfw/moderation/preferences",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/moderation/block",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/moderation/flags",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/moderation/audit",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/moderation/effective",)),).toBe(true,);
    expect(paths.some((p,) => p.includes("/api/nsfw/moderation/appeals",)),).toBe(true,);
  });

  test("preferences lookup for a user with no prefs returns 404 through the barrel", async () => {
    const res = await makeApp("u1",).handle(
      new Request("http://localhost/api/nsfw/moderation/preferences/u1",),
    );
    expect(res.status,).toBe(404,);
  });
});
