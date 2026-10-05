// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character-emotions barrel tests — mounts characterEmotionsRoutes behind
 * the same derive-auth harness as dice.test.ts and verifies the wiring.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertCharacterEmotions, insertEmotions, insertUsers, } from "../../test-utils/insert-helpers";
import { characterEmotionsRoutes, } from "./index";

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
  const app = new Elysia({ name: "test-emotions-barrel", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }

  return app.use(characterEmotionsRoutes({ database: db, },),);
}

describe("characterEmotionsRoutes barrel", () => {
  test("assembles an Elysia instance", () => {
    expect(makeApp("u1",),).toBeInstanceOf(Elysia,);
  });

  test("registers the actor and definition surfaces", () => {
    const paths = makeApp("u1",).routes.map((r,) => r.path);
    expect(paths.some((p,) => p.includes("/api/actors/:actorId/emotions",)),).toBe(true,);
    expect(paths.length,).toBeGreaterThan(1,);
  });

  test("emotion listing without auth returns 401 through the barrel", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/actors/123e4567-e89b-12d3-a456-426614174000/emotions",),
    );

    expect(res.status,).toBe(401,);
  });
});

describe("actor emotion cross-tenant scoping", () => {
  const ACTOR_A = "123e4567-e89b-12d3-a456-4266141740a1";
  const ACTOR_B = "123e4567-e89b-12d3-a456-4266141740b2";
  const VICTIM_ROW = "123e4567-e89b-12d3-a456-4266141740c3";
  const OWN_ROW = "123e4567-e89b-12d3-a456-4266141740d4";
  const EMO_JOY = "123e4567-e89b-12d3-a456-4266141740e1";
  const EMO_HAPPY = "123e4567-e89b-12d3-a456-4266141740e2";

  beforeAll(async () => {
    const now = new Date().toISOString();
    await insertUsers(db, "alice", "Alice", { id: "alice" as never, },);
    await insertUsers(db, "bob", "Bob", { id: "bob" as never, },);
    await insertActors(db, "Actor A", { id: ACTOR_A as never, owner_id: "alice", },);
    await insertActors(db, "Actor B", { id: ACTOR_B as never, owner_id: "bob", },);
    // character_emotions.emotion_id is FK → emotions.id, so the referenced
    // definitions must exist before the rows that point at them.
    const joyId = await insertEmotions(db, "joy", "Joy", "positive", 0.8, 0.6, now, { id: EMO_JOY, },);
    const happyId = await insertEmotions(db, "happy", "Happy", "positive", 0.9, 0.5, now, { id: EMO_HAPPY, },);
    await insertCharacterEmotions(db, ACTOR_B, happyId, now, now, {
      id: VICTIM_ROW,
      intensity: 0.9,
      context: "secret-bob",
    },);

    await insertCharacterEmotions(db, ACTOR_A, joyId, now, now, { id: OWN_ROW, },);
  },);

  test("GET under an owned actor does not leak a foreign emotion row", async () => {
    const res = await makeApp("alice",).handle(
      new Request(`http://localhost/api/actors/${ACTOR_A}/emotions/${VICTIM_ROW}`,),
    );

    expect(res.status,).toBe(404,);
    expect(await res.json(),).not.toHaveProperty("intensity",);
  });

  test("DELETE under an owned actor cannot remove a foreign emotion row", async () => {
    const res = await makeApp("alice",).handle(
      new Request(`http://localhost/api/actors/${ACTOR_A}/emotions/${VICTIM_ROW}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(404,);
    const still = await db
      .selectFrom("character_emotions",)
      .select("id",)
      .where("id", "=", VICTIM_ROW,)
      .executeTakeFirst();

    expect(still,).toBeDefined();
  });

  test("owner can still delete their own emotion row", async () => {
    const res = await makeApp("alice",).handle(
      new Request(`http://localhost/api/actors/${ACTOR_A}/emotions/${OWN_ROW}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(200,);
    const gone = await db
      .selectFrom("character_emotions",)
      .select("id",)
      .where("id", "=", OWN_ROW,)
      .executeTakeFirst();

    expect(gone,).toBeUndefined();
  });
});
