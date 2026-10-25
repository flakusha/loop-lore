// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Visibility contract for GET /api/actors (src/routes/characters/list.ts).
 *
 * Three tiers share the one route:
 *   - authenticated caller: own actors + ownerless (unchanged);
 *   - synthetic guest tier (`auth.guestAccess`, userId null + role `guest`):
 *     PUBLIC actors only — exactly the set the single-actor read
 *     (GET /api/actors/:actorId, src/routes/characters/read.ts) admits;
 *   - an id-less caller WITHOUT the guest role (derive denied the request,
 *     bare test double): nothing — no account-less enumeration.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { listRoutes, } from "./list";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const BASE = "http://localhost";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function appWithAuth(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-actors-list", },)
    .derive(() => ({ userId, userRole, }))
    .use(listRoutes({ database: db, },),) as unknown as Elysia;
}

describe("GET /api/actors — listing visibility", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;
  let strangerId: string;
  let publicActorId: string;
  let privateActorId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());

    ownerId = uid();
    strangerId = uid();
    await insertUsers(db, `actor-owner-${ownerId}`, "Actor Owner", { id: ownerId, } as never,);
    await insertUsers(db, `actor-stranger-${strangerId}`, "Actor Stranger", { id: strangerId, } as never,);

    publicActorId = await insertActors(db, "Public Npc", {
      id: uid(),
      // actor_type "user", not "character": Elysia's query normalizer fills
      // the omitted `type` enum with its first variant, so the list route
      // (pre-existing behavior) effectively filters actor_type = "user".
      actor_type: "user",
      user_id: ownerId,
      owner_id: ownerId,
      agent_type: "none",
      settings: "{}",
      row_version: 0,
      visibility: "public",
      import_spec: "{}",
    },);

    privateActorId = await insertActors(db, "Private Npc", {
      id: uid(),
      actor_type: "user",
      user_id: ownerId,
      owner_id: ownerId,
      agent_type: "none",
      settings: "{}",
      row_version: 0,
      visibility: "private",
      import_spec: "{}",
    },);
  },);

  afterAll(async () => {
    await sqlite.close();
  },);

  /**
   * @param app
   */
  async function listedIds(app: Elysia,): Promise<string[]> {
    const res = await app.handle(new Request(`${BASE}/api/actors`,),);
    expect(res.status,).toBe(200,);
    return ((await res.json()) as { data: { id: string }[] }).data.map((a,) => a.id);
  }

  test("a guest lists only PUBLIC actors", async () => {
    const ids = await listedIds(appWithAuth(db, null, "guest",),);
    expect(ids,).toContain(publicActorId,);
    expect(ids,).not.toContain(privateActorId,);
  });

  test("an id-less caller without the guest role sees nothing", async () => {
    const ids = await listedIds(appWithAuth(db, null, null,),);
    expect(ids,).toEqual([],);
  });

  test("a registered user keeps the own+ownerless arm", async () => {
    const ids = await listedIds(appWithAuth(db, ownerId, "user",),);
    expect(ids,).toContain(publicActorId,);
    expect(ids,).toContain(privateActorId,);
  });

  test("the owner's actors are invisible to a stranger's list", async () => {
    const ids = await listedIds(appWithAuth(db, strangerId, "user",),);
    expect(ids,).not.toContain(privateActorId,);
    expect(ids,).not.toContain(publicActorId,);
  });
});
