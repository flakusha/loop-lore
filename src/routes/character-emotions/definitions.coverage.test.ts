// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route-level coverage for `definitionRoutes` (GET/POST /api/emotions).
 *
 * `actor.test.ts` drives the actor sub-plugin, so this plugin's handlers were
 * never executed over HTTP: the `requireUserId` guard, the `admin.settings`
 * gate and the selectAll list were all unmeasured. These go through HTTP so a
 * dropped guard or a wrong status fails here.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertEmotions, } from "../../test-utils/insert-helpers";
import { definitionRoutes, } from "./definitions";

createLogger({ level: "error", },);

let db: Kysely<DB>;

/**
 * @param userId
 * @param userRole
 */
function app(userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-emotion-definitions", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
    .use(definitionRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param name
 */
async function seedEmotion(name: string,): Promise<string> {
  return insertEmotions(db, name, name, "neutral", 0, 0, new Date().toISOString(),);
}

beforeAll(async () => {
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

describe("emotion definition routes", () => {
  test("GET /api/emotions is 401 without a signed-in user", async () => {
    const res = await app(null, null,).handle(new Request("http://localhost/api/emotions",),);

    expect(res.status,).toBe(401,);
  });

  test("GET /api/emotions returns every stored definition", async () => {
    const joyId = await seedEmotion("joy",);
    const griefId = await seedEmotion("grief",);

    const res = await app("u1", "user",).handle(new Request("http://localhost/api/emotions",),);
    expect(res.status,).toBe(200,);
    const rows: { id: string; name: string; category: string }[] = await res.json();
    const byId = new Map(rows.map((row,) => [row.id, row,]),);
    expect(byId.get(joyId,)?.name,).toBe("joy",);
    expect(byId.get(joyId,)?.category,).toBe("neutral",);
    expect(byId.get(griefId,)?.name,).toBe("grief",);
  });

  test("POST /api/emotions is 401 without a signed-in user", async () => {
    const res = await app(null, null,).handle(
      new Request("http://localhost/api/emotions", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "awe", },),
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("POST /api/emotions persists the definition for an admin and lists it", async () => {
    const res = await app("u1", "admin",).handle(
      new Request("http://localhost/api/emotions", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "wonder", },),
      },),
    );

    expect(res.status,).toBe(201,);
    const created: { id: string } = await res.json();

    const stored = await db.selectFrom("emotions",).selectAll().execute();
    const row = stored.find((entry,) => entry.id === created.id);
    expect(row?.name,).toBe("wonder",);
    expect(row?.display_name,).toBe("wonder",);
    expect(row?.category,).toBe("neutral",);
    expect(row?.valence,).toBe(0,);
    expect(row?.arousal,).toBe(0,);

    const listed = await app("u1", "user",).handle(new Request("http://localhost/api/emotions",),);
    const rows: { id: string }[] = await listed.json();
    expect(rows.some((entry,) => entry.id === created.id),).toBe(true,);
  });

  test("POST /api/emotions is 403 for a signed-in non-admin", async () => {
    const res = await app("u1", "user",).handle(
      new Request("http://localhost/api/emotions", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "awe", },),
      },),
    );

    expect(res.status,).toBe(403,);
    const body: { error: string } = await res.json();
    expect(body.error,).toBe("Admin access required",);
    const stored = await db.selectFrom("emotions",).selectAll().execute();
    expect(stored.some((row,) => row.name === "envy"),).toBe(false,);
  });

  test("POST /api/emotions answers 409 for a duplicate name (uq_emotions_name)", async () => {
    const first = await app("u1", "admin",).handle(
      new Request("http://localhost/api/emotions", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "dup", },),
      },),
    );

    expect(first.status,).toBe(201,);
    const created: { id: string } = await first.json();
    const afterFirst = await db.selectFrom("emotions",).selectAll().execute();
    expect(afterFirst.filter((row,) => row.name === "dup").length,).toBe(1,);

    const second = await app("u1", "admin",).handle(
      new Request("http://localhost/api/emotions", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "dup", },),
      },),
    );

    expect(second.status,).toBe(409,);
    const conflict: { error: string } = await second.json();
    expect(conflict.error,).toBe('Emotion "dup" already exists',);

    const afterSecond = await db.selectFrom("emotions",).selectAll().execute();
    const duplicates = afterSecond.filter((row,) => row.name === "dup");
    expect(duplicates.length,).toBe(1,);
    expect(duplicates[0]?.id,).toBe(created.id,);
  });
});
