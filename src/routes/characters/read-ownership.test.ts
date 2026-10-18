// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ownership contract for GET /api/actors/:actorId (src/routes/characters/read.ts).
 *
 * The route applies two gates, in this order:
 *   1. `can(userRole, "admin.character")` — the ownership BYPASS. Only the
 *      wildcard roles (admin / solo / tester) hold it, so it must never be
 *      reachable by an ordinary user or a moderator.
 *   2. Otherwise the actor must be `public` OR owned by the caller. Anything
 *      else answers 404 (not 403) so the response does not confirm that someone
 *      else's private character exists.
 *
 * This is the stranger/anonymous half of the id-scoped route contract; the
 * `admin.character` bypass itself is pinned by src/users/permissions.test.ts.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { readRoutes, } from "./read";
import type { HandlerOpts, } from "./types";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const STRANGER_ID = "22222222-2222-4222-8222-222222222222";
const PRIVATE_ACTOR_ID = "33333333-3333-4333-8333-333333333333";
const PUBLIC_ACTOR_ID = "44444444-4444-4444-8444-444444444444";

/** Mount readRoutes under a fixed identity. `userId: null` is the anonymous case. */
function mount(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  // The cast matches the neighbouring harness (update.boundary.test.ts): `.use`
  // of a named, schema-carrying plugin widens the Elysia generic past the bare
  // parameter type, which the derive-app type cannot express.
  return new Elysia()
    .derive(() => ({ userId, userRole, }))
    .use(readRoutes({ database: db, } as HandlerOpts,),) as unknown as Elysia;
}

/** GET the actor by id and return the raw response for status assertions. */
function getActor(app: Elysia, actorId: string,) {
  return app.handle(new Request(`http://localhost/api/actors/${actorId}`,),);
}

/**
 * Two actors owned by OWNER_ID: one private (the default), one explicitly
 * public so the visibility branch can be exercised independently of ownership.
 */
async function seed(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, "char-owner", "Char Owner", { id: OWNER_ID, } as never,);
  await insertUsers(db, "char-stranger", "Char Stranger", { id: STRANGER_ID, } as never,);

  await insertActors(db, "Private Character", {
    id: PRIVATE_ACTOR_ID,
    user_id: OWNER_ID,
    owner_id: OWNER_ID,
    visibility: "private",
  } as never,);

  await insertActors(db, "Public Character", {
    id: PUBLIC_ACTOR_ID,
    user_id: OWNER_ID,
    owner_id: OWNER_ID,
    visibility: "public",
  } as never,);
}

describe("GET /api/actors/:actorId — ownership", () => {
  test("the owner reads their own private character", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await getActor(mount(db, OWNER_ID, "user",), PRIVATE_ACTOR_ID,);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { id: string; visibility: string };
    expect(body.id,).toBe(PRIVATE_ACTOR_ID,);

    await db.destroy();
  });

  test("a stranger gets 404 for another user's private character, not the row", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await getActor(mount(db, STRANGER_ID, "user",), PRIVATE_ACTOR_ID,);

    // 404 rather than 403: a 403 would confirm the character exists.
    expect(res.status,).toBe(404,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.id,).toBeUndefined();
    expect(JSON.stringify(body,),).not.toContain("Private Character",);

    await db.destroy();
  });

  test("an anonymous caller gets 404 for another user's private character", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // userId null is exactly what the auth derive yields when authentication
    // fails (src/elysia-app.ts), so this is the unauthenticated request path.
    const res = await getActor(mount(db, null, null,), PRIVATE_ACTOR_ID,);

    expect(res.status,).toBe(404,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.id,).toBeUndefined();
    expect(JSON.stringify(body,),).not.toContain("Private Character",);

    await db.destroy();
  });

  test("a moderator does not bypass character ownership", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // moderator holds character.view but NOT admin.character, so the bypass
    // must not fire and the stranger rule still applies.
    const res = await getActor(mount(db, STRANGER_ID, "moderator",), PRIVATE_ACTOR_ID,);

    expect(res.status,).toBe(404,);

    await db.destroy();
  });

  test("an admin bypasses ownership and reads a private character", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await getActor(mount(db, STRANGER_ID, "admin",), PRIVATE_ACTOR_ID,);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { id: string };
    expect(body.id,).toBe(PRIVATE_ACTOR_ID,);

    await db.destroy();
  });

  test("a solo role bypasses ownership for the instance owner", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await getActor(mount(db, STRANGER_ID, "solo",), PRIVATE_ACTOR_ID,);

    expect(res.status,).toBe(200,);

    await db.destroy();
  });

  test("visibility, not ownership, is what lets a stranger read a public character", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await getActor(mount(db, STRANGER_ID, "user",), PUBLIC_ACTOR_ID,);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { id: string; visibility: string };
    expect(body.visibility,).toBe("public",);

    await db.destroy();
  });

  test("an anonymous caller may read a public character but not a private one", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = mount(db, null, null,);

    expect((await getActor(app, PUBLIC_ACTOR_ID,)).status,).toBe(200,);
    expect((await getActor(app, PRIVATE_ACTOR_ID,)).status,).toBe(404,);

    await db.destroy();
  });

  test("an unknown actor id is 404 for every caller, admin included", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const unknown = "55555555-5555-4555-8555-555555555555";

    // The bypass runs AFTER the not-found check, so it must not manufacture a
    // row for an id that does not exist.
    expect((await getActor(mount(db, OWNER_ID, "user",), unknown,)).status,).toBe(404,);
    expect((await getActor(mount(db, STRANGER_ID, "admin",), unknown,)).status,).toBe(404,);

    await db.destroy();
  });
});
