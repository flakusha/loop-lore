// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TASK-031 boundary guard on PUT /api/actors/:actorId.
 *
 * A character update carrying world-owned fields must be rejected with 422
 * (naming the fields) without touching the row, while legitimate character
 * writes — including shared keys like `description` — keep working. The
 * guard sits behind the ownership check, so unauthorized callers still get
 * their auth error.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import type { HandlerOpts, } from "./types";
import { updateRoutes, } from "./update";

const BASE = "http://localhost";

/**
 * @param db
 * @param userId
 */
function appWithAuth(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-update-boundary", },)
    .derive(() => ({ userId, userRole: "user", }))
    .use(updateRoutes({ database: db, } as HandlerOpts,),) as unknown as Elysia;
}

/**
 * @param db
 * @param id
 */
async function currentVersion(db: Kysely<DB>, id: string,): Promise<number> {
  const row = await db
    .selectFrom("actors",)
    .select("format_version",)
    .where("id", "=", id,)
    .executeTakeFirst();
  if (!row) { throw new Error(`actor ${id} missing`,); }
  return row.format_version;
}

describe("PUT /api/actors/:actorId — character/world boundary", () => {
  let db: Kysely<DB>;
  let sqlite: Awaited<ReturnType<typeof createTestDb>>["sqlite"];
  let ownerId: string;
  let actorId: string;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());

    ownerId = uid();
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    actorId = uid();
    await insertActors(db, "Boundary Char", {
      id: actorId,
      actor_type: "npc",
      owner_id: ownerId,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
    } as never,);
  },);

  afterAll(async () => {
    await sqlite.close();
  },);

  test("rejects world-owned fields with 422 naming them, without writing the row", async () => {
    const res = await appWithAuth(db, ownerId,).handle(
      new Request(`${BASE}/api/actors/${actorId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          displayName: "Renamed",
          lore: "world lore",
          dataVersion: await currentVersion(db, actorId,),
        },),
      },),
    );
    expect(res.status,).toBe(422,);
    const body = await res.json() as { error: string };
    expect(body.error,).toContain('"lore"',);
    expect(body.error,).toContain("world-owned",);
    expect(body.error,).not.toContain("displayName",);

    const row = await db
      .selectFrom("actors",)
      .select("display_name",)
      .where("id", "=", actorId,)
      .executeTakeFirst();
    expect(row?.display_name,).toBe("Boundary Char",);
  });

  test("legitimate character fields still update (no over-blocking)", async () => {
    const res = await appWithAuth(db, ownerId,).handle(
      new Request(`${BASE}/api/actors/${actorId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          displayName: "Renamed",
          personality: "witty",
          dataVersion: await currentVersion(db, actorId,),
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const row = await db
      .selectFrom("actors",)
      .select(["display_name", "personality",],)
      .where("id", "=", actorId,)
      .executeTakeFirst();
    expect(row?.display_name,).toBe("Renamed",);
    expect(row?.personality,).toBe("witty",);
  });

  test("shared key `description` still updates", async () => {
    const res = await appWithAuth(db, ownerId,).handle(
      new Request(`${BASE}/api/actors/${actorId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ description: "card text", dataVersion: await currentVersion(db, actorId,), },),
      },),
    );
    expect(res.status,).toBe(200,);
    const row = await db
      .selectFrom("actors",)
      .select("description",)
      .where("id", "=", actorId,)
      .executeTakeFirst();
    expect(row?.description,).toBe("card text",);
  });

  test("unauthenticated caller still gets 401 (guard sits behind auth)", async () => {
    const res = await appWithAuth(db, null,).handle(
      new Request(`${BASE}/api/actors/${actorId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ lore: "world lore", dataVersion: 0, },),
      },),
    );
    expect(res.status,).toBe(401,);
  });
});
