// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for character-internal-traits route authz (IDOR fix).
 *
 * Bug: BUG-character-internal-traits-idor-actor-ownership-never-checked
 *
 * PUT/DELETE on /api/character-internal-traits must enforce that the
 * requesting user owns the actor identified by the query actorId (or
 * has admin role). Previously the routes only called requireUserId,
 * letting any authenticated user overwrite/delete any actor's traits.
 */

import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { characterInternalTraitsRoutes, } from "./index";

const ACTOR_OWNED_BY_OWNER = "00000000-0000-4000-8000-000000000001";
const ACTOR_OWNED_BY_OTHER = "00000000-0000-4000-8000-000000000002";
const OWNER = "owner-user";
const OTHER = "other-user";
const ADMIN = "admin-user";

function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-internal-traits-authz", },);
  if (userId) { app.derive(() => ({ userId, userRole, })); }
  return app.use(characterInternalTraitsRoutes({ database: db, },),);
}

describe("character-internal-traits IDOR authz", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, OWNER, "Owner User", { id: OWNER as never, },);
    await insertUsers(db, OTHER, "Other User", { id: OTHER as never, },);
    await insertUsers(db, ADMIN, "Admin User", { id: ADMIN as never, role: "admin" as never, },);
    await insertActors(db, "Owner's Hero", {
      id: ACTOR_OWNED_BY_OWNER as never,
      owner_id: OWNER as never,
    },);
    await insertActors(db, "Other's Hero", {
      id: ACTOR_OWNED_BY_OTHER as never,
      owner_id: OTHER as never,
    },);
  },);

  afterAll(() => sqlite.close());

  test("PUT rejects unauthenticated caller with 401", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/character-internal-traits?actorId=${ACTOR_OWNED_BY_OWNER}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("PUT rejects non-owner non-admin caller with 404", async () => {
    const res = await makeApp(db, OTHER, "user",).handle(
      new Request(`http://localhost/api/character-internal-traits?actorId=${ACTOR_OWNED_BY_OWNER}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("PUT allows the actor's owner", async () => {
    const res = await makeApp(db, OWNER, "user",).handle(
      new Request(`http://localhost/api/character-internal-traits?actorId=${ACTOR_OWNED_BY_OWNER}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("PUT allows an admin to edit any actor", async () => {
    const res = await makeApp(db, ADMIN, "admin",).handle(
      new Request(`http://localhost/api/character-internal-traits?actorId=${ACTOR_OWNED_BY_OTHER}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("DELETE rejects non-owner non-admin caller with 404", async () => {
    const res = await makeApp(db, OTHER, "user",).handle(
      new Request(`http://localhost/api/character-internal-traits?actorId=${ACTOR_OWNED_BY_OWNER}`, {
        method: "DELETE",
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE allows the actor's owner", async () => {
    const res = await makeApp(db, OWNER, "user",).handle(
      new Request(`http://localhost/api/character-internal-traits?actorId=${ACTOR_OWNED_BY_OWNER}`, {
        method: "DELETE",
      },),
    );
    expect(res.status,).toBe(200,);
  });
});
