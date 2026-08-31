/**
 * Tests for character-licensing routes (GET/POST/DELETE per actor).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { characterLicensingRoutes, } from "./character-licensing";

const OWNER_ACTOR = "00000000-0000-4000-8000-000000000001";
const MEMBER_ACTOR = "00000000-0000-4000-8000-000000000002";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-char-licensing", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(characterLicensingRoutes({ database: db, },),);
}

interface LicensingBody {
  id?: string;
  actor_id?: string;
  license_type?: string;
  allow_derivatives?: number;
  allow_commercial?: number;
  share_alike?: number;
  error?: string;
  ok?: boolean;
  updated?: boolean;
}

describe("character-licensing routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertUsers(db, "member", "Member", { id: "member" as never, },);
    await insertActors(db, "Owner Actor", { id: OWNER_ACTOR as never, owner_id: "owner", },);
    await insertActors(db, "Member Actor", { id: MEMBER_ACTOR as never, owner_id: "member", },);
  },);

  afterAll(() => sqlite.close());

  test("GET requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/licensing`,),
    );
    expect(res.status,).toBe(401,);
  });

  test("GET returns 404 for unknown actor", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request("http://localhost/api/actors/99999999-9999-4999-8999-999999999999/licensing",),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/licensing`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET returns 404 when no licensing row exists", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/licensing`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET returns licensing row for owner", async () => {
    await db
      .insertInto("character_licensing",)
      .values({
        id: "lic-1",
        actor_id: OWNER_ACTOR,
        license_type: "cc0",
        custom_license_text: null,
        attribution: "Test Author",
        allow_derivatives: 1,
        allow_commercial: 1,
        share_alike: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();

    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/licensing`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as LicensingBody;
    expect(body.license_type,).toBe("cc0",);
    expect(body.allow_derivatives,).toBe(1,);
    expect(body.actor_id,).toBe(OWNER_ACTOR,);
  });

  test("POST requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/licensing`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ license_type: "cc0", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/licensing`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ license_type: "cc0", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST creates licensing row with snake_case fields", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${MEMBER_ACTOR}/licensing`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          license_type: "custom",
          custom_license_text: "Free for any use",
          attribution: "Aria",
          allow_derivatives: true,
          allow_commercial: false,
          share_alike: true,
        },),
      },),
    );
    expect(res.status,).toBe(201,);

    const row = await db
      .selectFrom("character_licensing",)
      .select([
        "actor_id",
        "license_type",
        "custom_license_text",
        "attribution",
        "allow_derivatives",
        "allow_commercial",
        "share_alike",
      ],)
      .where("actor_id", "=", MEMBER_ACTOR,)
      .executeTakeFirst();
    expect(row?.actor_id,).toBe(MEMBER_ACTOR,);
    expect(row?.license_type,).toBe("custom",);
    expect(row?.custom_license_text,).toBe("Free for any use",);
    expect(row?.attribution,).toBe("Aria",);
    expect(row?.allow_derivatives,).toBe(1,);
    expect(row?.allow_commercial,).toBe(0,);
    expect(row?.share_alike,).toBe(1,);
  });

  test("POST creates licensing row with defaults when body minimal", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/licensing`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ license_type: "proprietary", },),
      },),
    );
    expect(res.status,).toBe(200,); // upsert: row already existed (lic-1)
    const body = await res.json() as LicensingBody;
    expect(body.updated,).toBe(true,);

    const row = await db
      .selectFrom("character_licensing",)
      .select(["license_type", "allow_derivatives", "allow_commercial", "share_alike",],)
      .where("actor_id", "=", OWNER_ACTOR,)
      .executeTakeFirst();
    expect(row?.license_type,).toBe("proprietary",);
    expect(row?.allow_derivatives,).toBe(1,);
    expect(row?.allow_commercial,).toBe(1,); // preserved from seeded row
    expect(row?.share_alike,).toBe(0,);
  });

  test("POST updates existing licensing", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${MEMBER_ACTOR}/licensing`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ license_type: "proprietary", allow_commercial: true, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as LicensingBody;
    expect(body.updated,).toBe(true,);
    expect(body.id,).toBeDefined();

    const row = await db
      .selectFrom("character_licensing",)
      .select(["license_type", "allow_commercial", "custom_license_text",],)
      .where("actor_id", "=", MEMBER_ACTOR,)
      .executeTakeFirst();
    expect(row?.license_type,).toBe("proprietary",);
    expect(row?.allow_commercial,).toBe(1,);
    expect(row?.custom_license_text,).toBe("Free for any use",); // preserved
  });

  test("DELETE requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/licensing`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(401,);
  });

  test("DELETE returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${OWNER_ACTOR}/licensing`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE removes licensing row", async () => {
    const res = await makeApp(db, "member", "user",).handle(
      new Request(`http://localhost/api/actors/${MEMBER_ACTOR}/licensing`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(200,);
    expect((await res.json() as LicensingBody).ok,).toBe(true,);

    const row = await db
      .selectFrom("character_licensing",)
      .select("id",)
      .where("actor_id", "=", MEMBER_ACTOR,)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });
});
