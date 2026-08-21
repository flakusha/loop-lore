/**
 * Tests for character-relationships routes (list / one / create / update / delete / events).
 *
 * The route handlers read the snake_case body keys declared by the Elysia
 * schemas (`target_actor_id`, `relationship_type`, …) and map them into the
 * service's camelCase options. Responses are the service's camelCase shape.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { characterRelationshipsRoutes, } from "./character-relationships";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const C = "00000000-0000-4000-8000-000000000003";
const D = "00000000-0000-4000-8000-000000000004";
const E = "00000000-0000-4000-8000-000000000005";
const WORLD = "00000000-0000-4000-8000-000000000101";

function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-char-relationships", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(characterRelationshipsRoutes({ database: db, },),);
}

interface Relationship {
  id: string;
  actorId: string;
  targetActorId: string;
  worldId: string | null;
  relationshipType: string;
  standing: number;
  trust: number;
  familiarity: number;
  isBidirectional: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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
    await insertActors(db, "Actor D", { id: D as never, owner_id: "member", },);
    await insertActors(db, "Actor E", { id: E as never, owner_id: "member", },);
    await insertWorlds(db, "owner", "Test World", { id: WORLD as never, },);
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

  test("POST create stores a relationship with defaults", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ target_actor_id: C, relationship_type: "friend", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = await res.json() as { id: string };
    expect(id,).toBeDefined();

    const rel = await db
      .selectFrom("character_relationships",)
      .selectAll()
      .where("id", "=", id,)
      .executeTakeFirst();
    expect(rel,).toBeDefined();
    expect(rel?.actor_id,).toBe(B,);
    expect(rel?.target_actor_id,).toBe(C,);
    expect(rel?.relationship_type,).toBe("friend",);
    expect(rel?.standing,).toBe(0,);
    expect(rel?.trust,).toBe(0,);
    expect(rel?.familiarity,).toBe(50,);
    expect(rel?.is_bidirectional,).toBe(0,);
    expect(rel?.world_id,).toBeNull();
  });

  test("POST create rejects empty relationship_type", async () => {
    // Empty string passes t.String() (minLength 0) but fails the handler's
    // presence guard — exercises the BadRequest branch.
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ target_actor_id: C, relationship_type: "", },),
      },),
    );
    expect(res.status,).toBe(400,);
    const body = await res.json() as { error: string };
    expect(body.error,).toContain("required",);
  });

  test("POST create stores full fields incl. world, metadata, bidirectional", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          target_actor_id: D,
          relationship_type: "ally",
          world_id: WORLD,
          standing: 25,
          trust: 10,
          familiarity: 70,
          is_bidirectional: true,
          metadata: { tag: "quest", },
        },),
      },),
    );
    expect(res.status,).toBe(201,);

    const rel = await db
      .selectFrom("character_relationships",)
      .selectAll()
      .where("actor_id", "=", B,)
      .where("target_actor_id", "=", D,)
      .executeTakeFirst();
    expect(rel?.standing,).toBe(25,);
    expect(rel?.trust,).toBe(10,);
    expect(rel?.familiarity,).toBe(70,);
    expect(rel?.is_bidirectional,).toBe(1,);
    expect(rel?.world_id,).toBe(WORLD,);
    expect(JSON.parse(rel?.metadata ?? "{}",),).toEqual({ tag: "quest", },);

    // Reverse row exists because is_bidirectional = true
    const reverse = await db
      .selectFrom("character_relationships",)
      .select("actor_id",)
      .where("actor_id", "=", D,)
      .where("target_actor_id", "=", B,)
      .executeTakeFirst();
    expect(reverse,).toBeDefined();
  });

  test("POST create rejects missing required fields (422)", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ relationship_type: "friend", },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST create ignores unknown body fields (stripped by schema)", async () => {
    // Unknown keys like the legacy `strength` are stripped by the body schema.
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ target_actor_id: E, relationship_type: "friend", strength: 8, },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = await res.json() as { id: string };
    const rel = await db
      .selectFrom("character_relationships",)
      .select("id",)
      .where("id", "=", id,)
      .executeTakeFirst();
    expect(rel,).toBeDefined();
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

  test("GET list returns created relationships in camelCase service shape", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships`,),
    );
    expect(res.status,).toBe(200,);
    const rows = await res.json() as Relationship[];
    // Unfiltered GET returns global (world-less) relationships only.
    const rel = rows.find((r,) => r.targetActorId === C);
    expect(rel,).toBeDefined();
    expect(rel?.relationshipType,).toBe("friend",);
    expect(rel?.standing,).toBe(0,);
    expect(rel?.isBidirectional,).toBe(false,);
    expect(rel?.worldId,).toBeNull();
    expect(rows.some((r,) => r.targetActorId === E),).toBe(true,);
  });

  test("GET list filtered by worldId", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships?worldId=${WORLD}`,),
    );
    expect(res.status,).toBe(200,);
    const rows = await res.json() as Relationship[];
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.targetActorId,).toBe(D,);
  });

  test("GET one returns relationship", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${C}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as Relationship;
    expect(body.actorId,).toBe(B,);
    expect(body.targetActorId,).toBe(C,);
    expect(body.relationshipType,).toBe("friend",);
    expect(body.standing,).toBe(0,);
  });

  test("GET one scoped to worldId", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${D}?worldId=${WORLD}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as Relationship;
    expect(body.targetActorId,).toBe(D,);
    expect(body.relationshipType,).toBe("ally",);
    expect(body.standing,).toBe(25,);
    expect(body.worldId,).toBe(WORLD,);
  });

  test("GET one returns 404 when relationship missing", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${A}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET one returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${D}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("PUT updates relationship fields", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${D}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          world_id: WORLD,
          relationship_type: "rival",
          standing: -40,
          familiarity: 20,
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    expect((await res.json() as { ok: boolean }).ok,).toBe(true,);

    const rel = await db
      .selectFrom("character_relationships",)
      .select(["relationship_type", "standing", "trust", "familiarity",],)
      .where("actor_id", "=", B,)
      .where("target_actor_id", "=", D,)
      .executeTakeFirst();
    expect(rel?.relationship_type,).toBe("rival",);
    expect(rel?.standing,).toBe(-40,);
    expect(rel?.trust,).toBe(10,);
    expect(rel?.familiarity,).toBe(20,);
  });

  test("PUT returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${D}`, {
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
      .where("target_actor_id", "=", C,)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("DELETE returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/${D}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST events applies deltas", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/events`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          target_actor_id: D,
          event_type: "helped",
          world_id: WORLD,
          standing_delta: 5,
          trust_delta: 3,
          familiarity_delta: 2,
          metadata: { note: "first help", },
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    expect((await res.json() as { ok: boolean }).ok,).toBe(true,);

    const rel = await db
      .selectFrom("character_relationships",)
      .select(["standing", "trust", "familiarity", "metadata",],)
      .where("actor_id", "=", B,)
      .where("target_actor_id", "=", D,)
      .executeTakeFirst();
    expect(rel?.standing,).toBe(-35,);
    expect(rel?.trust,).toBe(13,);
    expect(rel?.familiarity,).toBe(22,);
    const meta = JSON.parse(rel?.metadata ?? "{}",);
    expect(meta.note,).toBe("first help",);
    expect(meta.lastEvent,).toBe("helped",);
  });

  test("POST events missing target_actor_id is rejected (422)", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/events`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ event_type: "helped", },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST events requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/actors/${B}/relationships/events`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ target_actor_id: D, event_type: "helped", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  describe("Relationships — admin/solo bypass", () => {
    let db: Kysely<DB>;
    let sqlite: Database;

    beforeAll(async () => {
      ({ db, sqlite, } = await createTestDb());
      await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
      await insertUsers(db, "member", "Member", { id: "member" as never, },);
      await insertActors(db, "Actor A", { id: A as never, owner_id: "owner", },);
      await insertActors(db, "Actor B", { id: B as never, owner_id: "member", },);
      await insertWorlds(db, "owner", "Test World", { id: WORLD as never, },);
    },);

    afterAll(() => sqlite.close());

    test("admin can GET relationships for another user's actor", async () => {
      const app = makeApp(db, "admin", "admin",);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${A}/relationships`,),
      );
      expect(res.status,).toBe(200,);
    });

    test("solo can GET relationships for another user's actor", async () => {
      const app = makeApp(db, "solo", "solo",);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${A}/relationships`,),
      );
      expect(res.status,).toBe(200,);
    });

    test("admin can POST relationship for another user's actor", async () => {
      const app = makeApp(db, "admin", "admin",);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${A}/relationships`, {
          method: "POST",
          headers: { "content-type": "application/json", },
          body: JSON.stringify({ target_actor_id: B, relationship_type: "friend", },),
        },),
      );
      expect(res.status,).toBe(201,);
    });
  });
});
