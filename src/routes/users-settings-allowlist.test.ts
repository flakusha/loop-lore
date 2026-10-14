// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `PUT /api/users/:id/settings` enforces the same closed key allowlist as
 * `PATCH /api/settings`, and reports 404 for a user that does not exist.
 *
 * Before the fix the handler spread the entire raw request body into the
 * target's settings blob (`{ ...currentSettings, ...body }`), so any client
 * could write arbitrary keys — including `isAdmin` — into another user's
 * settings — and a PUT to a missing user returned 200.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { usersRoutes, } from "./users";

/**
 * @param db - test database
 * @param userId - identity the request is made as, or null for anonymous
 * @param userRole - role attached to that identity
 */
function createApp(db: Kysely<DB>, userId: string | null, userRole: string | null = "solo",): Elysia {
  return new Elysia({ name: "test-users-settings-allowlist", },)
    .derive(() => ({ userId, userRole, }))
    .use(usersRoutes({ database: db, config: {} as never, },),) as unknown as Elysia;
}

/**
 * @param id - target user id
 * @param body - request payload
 */
function putSettings(id: string, body: unknown,): Request {
  return new Request(`http://localhost/api/users/${id}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describe("PUT /api/users/:id/settings", () => {
  let db: Kysely<DB>;
  const userId = uid();
  const otherId = uid();
  const missingId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    for (const id of [userId, otherId,]) {
      await db
        .insertInto("users",)
        .values({
          id,
          username: `user-${id}`,
          display_name: "Test User",
          role: "solo",
          status: "active",
          settings: "{}",
        },)
        .execute();
    }
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("an allowlisted key is accepted and persisted", async () => {
    const app = createApp(db, userId,);

    const res = await app.handle(putSettings(userId, { theme: "dark", },),);

    expect(res.status,).toBe(200,);
    const row = await db.selectFrom("users",).select("settings",).where("id", "=", userId,).executeTakeFirst();
    expect(JSON.parse(row?.settings ?? "{}",).theme,).toBe("dark",);
  });

  test("a key outside the allowlist is rejected with 400", async () => {
    const app = createApp(db, userId,);

    const res = await app.handle(putSettings(userId, { theme: "light", isAdmin: true, },),);

    expect(res.status,).toBe(400,);
    const row = await db.selectFrom("users",).select("settings",).where("id", "=", userId,).executeTakeFirst();
    // The rejected write must not have landed, and neither must its sibling key.
    expect(JSON.parse(row?.settings ?? "{}",).isAdmin,).toBeUndefined();
  });

  test("a non-admin cannot write another user's settings", async () => {
    // `viewer` has no `admin.users` grant, unlike the `solo` default used above.
    const app = createApp(db, userId, "viewer",);

    const res = await app.handle(putSettings(otherId, { theme: "hijacked", },),);

    expect(res.status,).toBe(403,);
    const row = await db.selectFrom("users",).select("settings",).where("id", "=", otherId,).executeTakeFirst();
    expect(JSON.parse(row?.settings ?? "{}",).theme,).toBeUndefined();
  });

  test("PUT to a user that does not exist returns 404", async () => {
    const app = createApp(db, userId,);

    const res = await app.handle(putSettings(missingId, { theme: "dark", },),);

    expect(res.status,).toBe(404,);
  });
});
