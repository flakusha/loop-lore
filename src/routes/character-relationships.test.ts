/**
 * Tests for character-relationships routes (list / one / create / update / delete / events).
 *
 * NOTE: the route handlers read camelCase body keys (`targetActorId`,
 * `relationshipType`) while the Elysia body schemas declare snake_case
 * (`target_actor_id`, `relationship_type`). As a result POST create/events
 * never reach the service — they are pinned as 400/422 below, and GET/PUT
 * are tested against directly-seeded rows. A future fix to the mismatch
 * should flip these expectations.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { characterRelationshipsRoutes, } from "./character-relationships";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const C = "00000000-0000-4000-8000-000000000003";
const WORLD = "00000000-0000-4000-8000-000000000101";

function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-char-relationships", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(characterRelationshipsRoutes({ database: db, },),);
}

interface RelBody {
  relationshipType?: string;
  actorId?: string;
  targetActorId?: string;
  standing?: number;
  id?: string;
  error?: string;
  ok?: boolean;
  actor_id?: string;
  target_actor_id?: string;
  relationship_type?: string;
  strength?: number;
}

describe("character-relationships routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertUsers(db, "member", "Member", { id: "member" as never, },);
    await insertActors(db, "Actor A", { id: A as never, owner_id: "owner", },);
    await insertActors(db, "Actor B", { id: B as never, owner_id: "member", },);
    await insertActors(db, "Actor C", { id: C as never, owner_id: "member", },);
  },);

  afterAll(() => sqlite.close());

  test("GET list requires auth", async () => {
    const res = await makeApp(db,).handle(new Request(`http://localhost/api/actors/${A}/relationships`,),);
    expect(res.status,).toBe(401,);
  });

  test("GET list returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${A}/relationships`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET list returns empty array when no relationships", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${A}/relationships`,),
    );
    expect(res.status,).toBe(200,);
    expect(await res.json(),).toEqual([],);
  });

  test("GET list returns seeded relationships", async () => {
    await db
      .insertInto("character_relationships",)
      .values({
        id: "rel-1",
        actor_id: B,
        target_actor_id: C,
        relationship_type: "friend",
        standing: 10,
        trust: 5,
        familiarity: 50,
        is_bidirectional: 0,
        metadata: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();

    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships`,),
    );
    expect(res.status,).toBe(200,);
    const rows = await res.json() as RelBody[];
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.relationshipType,).toBe("friend",);
    expect(rows[0]?.actorId,).toBe(B,);
    expect(rows[0]?.targetActorId,).toBe(C,);
  });

  test("GET list filtered by worldId excludes world-less rows", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships?worldId=${WORLD}`,),
    );
    expect(res.status,).toBe(200,);
    expect(await res.json(),).toEqual([],);
  });

  test("GET one returns relationship", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${C}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as RelBody;
    expect(body.actorId,).toBe(B,);
    expect(body.targetActorId,).toBe(C,);
    expect(body.relationshipType,).toBe("friend",);
    expect(body.standing,).toBe(10,);
  });

  test("GET one returns 404 when relationship missing", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${A}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET one returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${C}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST create rejects camelCase body at schema level", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ targetActorId: C, relationshipType: "friend", },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST create with valid snake_case body hits route field check (documented mismatch)", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ target_actor_id: C, relationship_type: "friend", },),
      },),
    );
    // Route reads camelCase keys → always 400 until the mismatch is fixed.
    expect(res.status,).toBe(400,);
    expect((await res.json() as RelBody).error,).toBeDefined();
  });

  test("POST create requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/actors/${B}/relationships`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ target_actor_id: C, relationship_type: "friend", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST create returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ target_actor_id: C, relationship_type: "friend", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("PUT returns 200 for owner (no-op update)", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${C}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ relationship_type: "ally", strength: 8, },),
      },),
    );
    expect(res.status,).toBe(200,);
    expect((await res.json() as RelBody).ok,).toBe(true,);
  });

  test("PUT returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${C}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ relationship_type: "enemy", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE removes relationship with 204", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${C}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(204,);

    const row = await db
      .selectFrom("character_relationships",)
      .select("id",)
      .where("actor_id", "=", B,)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("DELETE returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${C}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST events with snake_case body hits route field check (documented mismatch)", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/events`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ event_type: "helped", delta: 5, },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("POST events requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/events`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ event_type: "helped", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });
});
