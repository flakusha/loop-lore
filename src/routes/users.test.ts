/**
 * Tests for users routes — profile, settings, admin operations
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { usersRoutes, } from "./users";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function createApp(db: Kysely<DB>, userId: string | null, userRole: string | null = "solo",): Elysia {
  return new Elysia({ name: "test-users", },)
    .derive(() => ({ userId, userRole, }))
    .use(usersRoutes({ database: db, config: {} as any, },),) as unknown as Elysia;
}

describe("usersRoutes", () => {
  let db: Kysely<DB>;
  const userId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `user-${userId}`,
        display_name: "Test User",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  // ── GET /api/users/me ───────────────────────────────────────

  test("GET /api/users/me returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/users/me",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/users/me returns current user", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/users/me",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { id: string; display_name: string; username: string; role: string };
    expect(body.id,).toBe(userId,);
    expect(body.display_name,).toBe("Test User",);
    expect(body.username,).toBeDefined();
    expect(body.role,).toBe("solo",);
  });

  // ── PUT /api/users/me ───────────────────────────────────────

  test("PUT /api/users/me updates profile", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Updated Name", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok,).toBe(true,);

    const user = await db.selectFrom("users",).selectAll().where("id", "=", userId,).executeTakeFirst();
    expect(user?.display_name,).toBe("Updated Name",);
  });

  test("PUT /api/users/me returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "No Auth", },),
      },),
    );

    expect(res.status,).toBe(401,);
  });

  // ── PATCH /api/users/me/settings ────────────────────────────

  test("PATCH /api/users/me/settings merges settings", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/users/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ theme: "dark", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok,).toBe(true,);

    const user = await db.selectFrom("users",).select("settings",).where("id", "=", userId,).executeTakeFirst();
    const settings = JSON.parse(user?.settings ?? "{}",);
    expect(settings.theme,).toBe("dark",);
  });

  // ── GET /api/users/:id (admin only) ────────────────────────

  test("GET /api/users/:id returns 403 for non-admin", async () => {
    const app = createApp(db, userId, "user",);
    const res = await app.handle(new Request(`http://localhost/api/users/${userId}`,),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/users/:id returns user for admin", async () => {
    const adminApp = createApp(db, "admin-user", "admin",);
    await db
      .insertInto("users",)
      .values({
        id: "admin-user",
        username: "admin",
        display_name: "Admin",
        role: "admin",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const res = await adminApp.handle(new Request(`http://localhost/api/users/${userId}`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { id: string };
    expect(body.id,).toBe(userId,);
  });

  // ── PUT /api/users/:id ──────────────────────────────────────

  test("PUT /api/users/:id allows self-update", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Self Updated", },),
      },),
    );

    expect(res.status,).toBe(200,);

    const user = await db.selectFrom("users",).selectAll().where("id", "=", userId,).executeTakeFirst();
    expect(user?.display_name,).toBe("Self Updated",);
  });

  test("PUT /api/users/:id returns 403 for non-admin updating others", async () => {
    const otherUserId = uid();
    await db
      .insertInto("users",)
      .values({
        id: otherUserId,
        username: `user-${otherUserId}`,
        display_name: "Other",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const app = createApp(db, userId, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/users/${otherUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Hacked", },),
      },),
    );

    expect(res.status,).toBe(403,);
  });

  // ── DELETE /api/users/:id (admin only) ─────────────────────

  test("DELETE /api/users/:id returns 403 for non-admin", async () => {
    const app = createApp(db, userId, "user",);
    const res = await app.handle(new Request(`http://localhost/api/users/${userId}`, { method: "DELETE", },),);
    expect(res.status,).toBe(403,);
  });

  test("DELETE /api/users/:id removes user as admin", async () => {
    const targetId = uid();
    await db
      .insertInto("users",)
      .values({
        id: targetId,
        username: `user-${targetId}`,
        display_name: "Delete Me",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const adminApp = createApp(db, "admin-user", "admin",);
    const res = await adminApp.handle(
      new Request(`http://localhost/api/users/${targetId}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(204,);

    const user = await db.selectFrom("users",).selectAll().where("id", "=", targetId,).executeTakeFirst();
    expect(user,).toBeUndefined();
  });
});

describe("settings allowlist on all write paths (RA-03)", () => {
  let db: Kysely<DB>;
  let userId: string;

  beforeEach(async () => {
    ({ db, } = await createTestDb());
    userId = uid();
    await db.insertInto("users",).values({
      id: userId,
      username: `allow-${userId}`,
      display_name: "Allow",
      role: "solo",
      status: "active",
      settings: "{}",
    },).execute();
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  /** Read the stored blob — the assertion is on persistence, not on status alone. */
  async function stored(): Promise<Record<string, unknown>> {
    const row = await db.selectFrom("users",).select("settings",).where("id", "=", userId,).executeTakeFirst();

    return JSON.parse(row?.settings ?? "{}",) as Record<string, unknown>;
  }

  test("PATCH /users/me/settings rejects a privilege key without persisting it", async () => {
    const res = await createApp(db, userId,).handle(
      new Request("http://localhost/api/users/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ theme: "dark", isAdmin: true, },),
      },),
    );

    expect(res.status,).toBe(400,);
    expect(await stored(),).toEqual({},);
  });

  test("PATCH /users/me/settings still accepts the UI's own keys", async () => {
    const res = await createApp(db, userId,).handle(
      new Request("http://localhost/api/users/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          contentLocale: "fr-FR",
          workflowSelections: { sdxl: "base", },
          enterToSend: true,
        },),
      },),
    );

    expect(res.status,).toBe(200,);
    const settings = await stored();
    expect(settings.contentLocale,).toBe("fr-FR",);
    expect(settings.workflowSelections,).toEqual({ sdxl: "base", },);
    expect(settings.enterToSend,).toBe(true,);
  });

  test("PUT /users/me rejects a privilege key inside settings", async () => {
    const res = await createApp(db, userId,).handle(
      new Request("http://localhost/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ settings: { provider: "openai", role: "admin", }, },),
      },),
    );

    expect(res.status,).toBe(400,);
    expect(await stored(),).toEqual({},);
  });

  test("PUT /users/:id rejects a privilege key inside settings", async () => {
    const res = await createApp(db, "admin-user", "admin",).handle(
      new Request(`http://localhost/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ settings: { theme: "dark", isAdmin: true, }, },),
      },),
    );

    expect(res.status,).toBe(400,);
    expect(await stored(),).toEqual({},);
  });
});
