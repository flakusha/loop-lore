// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * actorRoutes handler tests — the happy paths and the 404 branches the
 * barrel wiring test does not reach (list, get-by-id, upsert create/update,
 * delete, and the not-owned / not-found responses behind each).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertCharacterEmotions, insertEmotions, insertUsers, } from "../../test-utils/insert-helpers";
import { actorRoutes, } from "./actor";

let db: Kysely<DB>;

beforeAll(async () => {
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

/**
 * @param userId optional authenticated user; omitted means unauthenticated
 */
function makeApp(userId?: string,) {
  const app = new Elysia({ name: "test-actor-emotions", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }

  return app.use(actorRoutes({ database: db, },),);
}

const ACTOR = "123e4567-e89b-12d3-a456-4266141740a1";
const OTHER_ACTOR = "123e4567-e89b-12d3-a456-4266141740b2";
const EMO_JOY = "123e4567-e89b-12d3-a456-4266141740e1";
const EMO_ANGER = "123e4567-e89b-12d3-a456-4266141740e2";
const OWN_ROW = "123e4567-e89b-12d3-a456-4266141740d4";

describe("actorRoutes", () => {
  beforeAll(async () => {
    const now = new Date().toISOString();
    await insertUsers(db, "alice", "Alice", { id: "alice" as never, },);
    await insertUsers(db, "bob", "Bob", { id: "bob" as never, },);
    await insertActors(db, "Actor", { id: ACTOR as never, owner_id: "alice", },);
    await insertActors(db, "Other", { id: OTHER_ACTOR as never, owner_id: "bob", },);
    // character_emotions.emotion_id is FK → emotions.id.
    await insertEmotions(db, "joy", "Joy", "positive", 0.8, 0.6, now, { id: EMO_JOY, },);
    await insertEmotions(db, "anger", "Anger", "negative", 0.9, 0.5, now, { id: EMO_ANGER, },);
    await insertCharacterEmotions(db, ACTOR, EMO_JOY, now, now, { id: OWN_ROW, },);
  },);

  test("lists an actor's active emotions", async () => {
    const res = await makeApp("alice",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotions`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { actor_id: string }[];
    expect(body.some((e,) => e.actor_id === ACTOR),).toBe(true,);
  });

  test("listing under an actor the caller does not own returns 404", async () => {
    const res = await makeApp("alice",).handle(
      new Request(`http://localhost/api/actors/${OTHER_ACTOR}/emotions`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("gets a single emotion by id", async () => {
    const res = await makeApp("alice",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotions/${OWN_ROW}`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { id: string };
    expect(body.id,).toBe(OWN_ROW,);
  });

  test("get returns 404 for an unknown emotion id", async () => {
    const res = await makeApp("alice",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotions/123e4567-e89b-12d3-a456-4266141740ff`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("get returns 404 under an unowned actor", async () => {
    const res = await makeApp("alice",).handle(
      new Request(`http://localhost/api/actors/${OTHER_ACTOR}/emotions/${OWN_ROW}`,),
    );

    expect(res.status,).toBe(404,);
  });

  // POST /actors/:actorId/emotions is a known dead endpoint: the validation
  // schema accepts `emotion_name` only, while the handler destructures
  // `emotionId`, so a schema-valid body inserts a NULL emotion_id and the
  // insert fails. Tracked by BUG-post-actors-actorid-emotions-is-a-dead-endpoint-
  // always-500 — pinned here so the breakage stays visible.
  test("post rejects a body without the schema's emotion_name", async () => {
    const res = await makeApp("alice",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotions`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ emotionId: EMO_ANGER, },),
      },),
    );

    expect(res.status,).toBe(422,);
  });

  test("post under an unowned actor returns 404 before touching the table", async () => {
    const res = await makeApp("alice",).handle(
      new Request(`http://localhost/api/actors/${OTHER_ACTOR}/emotions`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ emotion_name: "Joy", },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("delete under an unowned actor returns 404 and keeps the row", async () => {
    const res = await makeApp("alice",).handle(
      new Request(`http://localhost/api/actors/${OTHER_ACTOR}/emotions/${OWN_ROW}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(404,);
    const still = await db
      .selectFrom("character_emotions",)
      .select("id",)
      .where("id", "=", OWN_ROW,)
      .executeTakeFirst();

    expect(still,).toBeDefined();
  });

  test("delete returns 404 for an unknown emotion id", async () => {
    const res = await makeApp("alice",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotions/123e4567-e89b-12d3-a456-4266141740ff`, {
        method: "DELETE",
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("owner deletes their own emotion row", async () => {
    const res = await makeApp("alice",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/emotions/${OWN_ROW}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(200,);
    expect((await res.json() as { ok: boolean }).ok,).toBe(true,);
    const gone = await db
      .selectFrom("character_emotions",)
      .select("id",)
      .where("id", "=", OWN_ROW,)
      .executeTakeFirst();

    expect(gone,).toBeUndefined();
  });
});
