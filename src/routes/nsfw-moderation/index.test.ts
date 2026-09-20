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

  test("preferences lookup for a user with no prefs returns lazy defaults (no phantom row)", async () => {
    const res = await makeApp("u1",).handle(
      new Request("http://localhost/api/nsfw/moderation/preferences/u1",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { userId: string; nsfwEnabled: boolean } };
    expect(body.data.userId,).toBe("u1",);
    expect(body.data.nsfwEnabled,).toBe(true,);
    const rows = await db.selectFrom("nsfw_user_preferences",).select("id",).execute();
    expect(rows,).toEqual([],);
  });

  test("preferences PUT persists nsfwEnabled for the user", async () => {
    const res = await makeApp("u1",).handle(
      new Request("http://localhost/api/nsfw/moderation/preferences/u1", {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ nsfwEnabled: false, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { nsfwEnabled: boolean } };
    expect(body.data.nsfwEnabled,).toBe(false,);
  });

  test("preferences lookup with non-UUID id returns 4xx", async () => {
    const res = await makeApp("u1",).handle(
      new Request("http://localhost/api/nsfw/moderation/preferences/not-a-valid-uuid",),
    );
    expect([400, 403, 404, 422,],).toContain(res.status,);
  });

  test("oversized preferences path returns 4xx/403 without crashing", async () => {
    const huge = "u".repeat(4096,);
    const res = await makeApp("u1",).handle(
      new Request(`http://localhost/api/nsfw/moderation/preferences/${huge}`,),
    );
    expect([400, 403, 404, 414, 422,],).toContain(res.status,);
  });

  test("appeal action with malformed JSON returns 4xx/403", async () => {
    const res = await makeApp("u1",).handle(
      new Request("http://localhost/api/nsfw/moderation/appeals", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: "{not-valid-json",
      },),
    );
    expect([400, 403, 422,],).toContain(res.status,);
  });
});
