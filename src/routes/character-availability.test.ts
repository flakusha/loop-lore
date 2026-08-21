/**
 * Tests for character-availability routes (GET/POST/DELETE per actor).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { characterAvailabilityRoutes, } from "./character-availability";

const OWNER_ACTOR = "00000000-0000-4000-8000-000000000001";
const MEMBER_ACTOR = "00000000-0000-4000-8000-000000000002";

function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-char-availability", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(characterAvailabilityRoutes({ database: db, },),);
}

interface AvailabilityBody {
  id?: string;
  actor_id?: string;
  status?: string;
  usage_policy?: string | null;
  activity_restrictions?: string | null;
  error?: string;
  ok?: boolean;
  updated?: boolean;
}

describe("character-availability routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertUsers(db, "member", "Member", { id: "member" as never, },);
    await insertUsers(db, "admin", "Admin", { id: "admin" as never, },);
    await insertActors(db, "Owner Actor", { id: OWNER_ACTOR as never, owner_id: "owner", },);
    await insertActors(db, "Member Actor", { id: MEMBER_ACTOR as never, owner_id: "member", },);
  },);

  afterAll(() => sqlite.close());

  test("GET requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/availability`,),
    );
    expect(res.status,).toBe(401,);
  });

  test("GET returns 404 for unknown actor", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request("http://localhost/api/actors/99999999-9999-4999-8999-999999999999/availability",),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/availability`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET returns 404 when no availability row exists", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/availability`,),
    );
    expect(res.status,).toBe(404,);
    expect((await res.json() as AvailabilityBody).error,).toBeDefined();
  });

  test("GET returns availability row for owner", async () => {
    await db
      .insertInto("character_availability",)
      .values({
        id: "av-1",
        actor_id: OWNER_ACTOR,
        status: "available",
        usage_policy: "personal",
        activity_restrictions: "[]",
        content_policy: null,
        nsfw_policy: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();

    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/availability`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as AvailabilityBody;
    expect(body.status,).toBe("available",);
    expect(body.usage_policy,).toBe("personal",);
    expect(body.actor_id,).toBe(OWNER_ACTOR,);
  });

  test("admin can access any actor's availability", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request(`http://localhost/api/actors/${MEMBER_ACTOR}/availability`,),
    );
    expect(res.status,).toBe(404,); // member actor has no row yet
  });

  test("solo can access any actor's availability", async () => {
    const res = await makeApp(db, "solo", "solo",).handle(
      new Request(`http://localhost/api/actors/${MEMBER_ACTOR}/availability`,),
    );
    expect(res.status,).toBe(404,); // member actor has no row yet
  });

  test("POST requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/availability`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ status: "available", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/availability`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ status: "available", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST creates availability row with snake_case fields", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${MEMBER_ACTOR}/availability`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          status: "busy",
          usage_policy: "personal",
          activity_restrictions: ["weekdays", "evenings",],
          content_policy: "sfw",
          nsfw_policy: null,
        },),
      },),
    );
    expect(res.status,).toBe(201,);

    const row = await db
      .selectFrom("character_availability",)
      .select(["actor_id", "status", "usage_policy", "activity_restrictions", "content_policy",],)
      .where("actor_id", "=", MEMBER_ACTOR,)
      .executeTakeFirst();
    expect(row?.actor_id,).toBe(MEMBER_ACTOR,);
    expect(row?.status,).toBe("busy",);
    expect(row?.usage_policy,).toBe("personal",);
    expect(JSON.parse(row?.activity_restrictions ?? "[]",),).toEqual(["weekdays", "evenings",],);
    expect(row?.content_policy,).toBe("sfw",);
  });

  test("POST updates existing availability keeping absent fields", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${MEMBER_ACTOR}/availability`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ status: "offline", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as AvailabilityBody;
    expect(body.updated,).toBe(true,);
    expect(body.id,).toBeDefined();

    const row = await db
      .selectFrom("character_availability",)
      .select(["status", "usage_policy",],)
      .where("actor_id", "=", MEMBER_ACTOR,)
      .executeTakeFirst();
    expect(row?.status,).toBe("offline",);
    expect(row?.usage_policy,).toBe("personal",); // preserved from prior POST
  });

  test("DELETE requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/availability`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(401,);
  });

  test("DELETE returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/availability`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE removes availability row", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${MEMBER_ACTOR}/availability`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(200,);
    expect((await res.json() as AvailabilityBody).ok,).toBe(true,);

    const row = await db
      .selectFrom("character_availability",)
      .select("id",)
      .where("actor_id", "=", MEMBER_ACTOR,)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });
});
