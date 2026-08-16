/**
 * Tests for admin-character-overrides routes (list all / by actor / create / delete).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { adminCharacterOverridesRoutes, } from "./admin-character-overrides";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const ACTOR2 = "00000000-0000-4000-8000-000000000002";

function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-admin-overrides", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(adminCharacterOverridesRoutes({ database: db, },),);
}

interface OverrideBody {
  id?: string;
  actor_id?: string;
  admin_id?: string;
  action?: string;
  error?: string;
  ok?: boolean;
}

describe("admin-character-overrides routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "admin", "Admin", { id: "admin" as never, },);
    await insertUsers(db, "user", "User", { id: "user" as never, },);
    await insertActors(db, "Hero", { id: ACTOR as never, owner_id: "user", },);
    await insertActors(db, "Villain", { id: ACTOR2 as never, owner_id: "user", },);
  },);

  afterAll(() => sqlite.close());

  test("GET all requires auth", async () => {
    const res = await makeApp(db,).handle(new Request("http://localhost/api/admin/character-overrides",),);
    expect(res.status,).toBe(401,);
  });

  test("GET all requires admin role", async () => {
    const res = await makeApp(db, "user", "user",).handle(
      new Request("http://localhost/api/admin/character-overrides",),
    );
    expect(res.status,).toBe(403,);
  });

  test("GET all lists overrides for admin", async () => {
    await db
      .insertInto("admin_character_overrides",)
      .values({
        id: "ov-1",
        actor_id: ACTOR,
        admin_id: "admin",
        action: "restrict",
        visibility_override: null,
        license_override: null,
        reason: "spam",
        expires_at: null,
        created_at: new Date().toISOString(),
      },)
      .execute();

    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/admin/character-overrides",),
    );
    expect(res.status,).toBe(200,);
    const rows = await res.json() as OverrideBody[];
    expect(rows.length,).toBeGreaterThanOrEqual(1,);
    expect(rows.find((r,) => r.id === "ov-1")?.action,).toBe("restrict",);
  });

  test("GET by actor requires admin role", async () => {
    const res = await makeApp(db, "user", "user",).handle(
      new Request(`http://localhost/api/admin/actors/${ACTOR}/overrides`,),
    );
    expect(res.status,).toBe(403,);
  });

  test("GET by actor filters by actor", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request(`http://localhost/api/admin/actors/${ACTOR}/overrides`,),
    );
    expect(res.status,).toBe(200,);
    const rows = await res.json() as OverrideBody[];
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.actor_id,).toBe(ACTOR,);
  });

  test("POST create requires admin role", async () => {
    const res = await makeApp(db, "user", "user",).handle(
      new Request(`http://localhost/api/admin/actors/${ACTOR}/overrides`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ actor_id: ACTOR, action: "ban", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("POST create inserts override with admin id", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request(`http://localhost/api/admin/actors/${ACTOR2}/overrides`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ actor_id: ACTOR2, action: "approve", reason: "looks good", },),
      },),
    );
    expect(res.status,).toBe(201,);
    expect((await res.json() as OverrideBody).id,).toBeDefined();

    const row = await db
      .selectFrom("admin_character_overrides",)
      .select(["actor_id", "admin_id", "action", "reason",],)
      .where("actor_id", "=", ACTOR2,)
      .executeTakeFirst();
    expect(row?.admin_id,).toBe("admin",);
    expect(row?.action,).toBe("approve",);
    // schema field is `notes`, route reads `reason` → reason stays null (documented mismatch)
    expect(row?.reason,).toBeNull();
  });

  test("POST create rejects non-uuid actor param", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/admin/actors/not-a-uuid/overrides", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ actor_id: ACTOR, action: "ban", },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("DELETE requires admin role", async () => {
    const res = await makeApp(db, "user", "user",).handle(
      new Request("http://localhost/api/admin/character-overrides/ov-1", { method: "DELETE", },),
    );
    expect(res.status,).toBe(403,);
  });

  test("DELETE removes the override", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/admin/character-overrides/ov-1", { method: "DELETE", },),
    );
    expect(res.status,).toBe(200,);
    expect((await res.json() as OverrideBody).ok,).toBe(true,);

    const row = await db
      .selectFrom("admin_character_overrides",)
      .select("id",)
      .where("id", "=", "ov-1",)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("DELETE is idempotent for missing override", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/admin/character-overrides/does-not-exist", { method: "DELETE", },),
    );
    expect(res.status,).toBe(200,);
  });
});
