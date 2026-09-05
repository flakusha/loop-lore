// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression test for BUG-world-lore-silently-stripped-on-create-and-update.
 *
 * WorldCreateBody/WorldUpdateBody previously lacked a `lore` field, so
 * Elysia stripped it and NULL was persisted. This test verifies the lore
 * round-trip through the live worldRoutes plugin.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import type { HandleOpts, } from "./types";
import { worldRoutes, } from "./worlds-routes";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const BASE = "http://localhost";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function appWithAuth(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-worlds-lore", },)
    .derive(() => ({ userId, userRole, }))
    .use(worldRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

describe("worldRoutes — lore persistence (BUG-world-lore-silently-stripped)", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());

    ownerId = uid();
    await insertUsers(db, "owner", "Owner", { id: ownerId, } as never,);
    await insertActors(db, ownerId, {
      id: ownerId,
      actor_type: "user",
      user_id: ownerId,
      owner_id: ownerId,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
    } as never,);
  },);

  afterAll(async () => {
    await sqlite.close();
  },);

  test("create with lore persists it, update replaces it", async () => {
    const app = appWithAuth(db, ownerId, "user",);

    const createRes = await app.handle(
      new Request(`${BASE}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "Lore Realm", lore: "Ancient lore text.", },),
      },),
    );
    expect(createRes.status,).toBe(201,);
    const { id, } = await createRes.json() as { id: string };

    const got = await app.handle(
      new Request(`${BASE}/api/worlds/${id}`,),
    );
    expect(got.status,).toBe(200,);
    const world = (await got.json()) as { lore: string | null };
    expect(world.lore,).toBe("Ancient lore text.",);

    // Update lore.
    const updRes = await app.handle(
      new Request(`${BASE}/api/worlds/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ lore: "Updated lore.", },),
      },),
    );
    expect(updRes.status,).toBe(200,);

    const gotAfter = await app.handle(
      new Request(`${BASE}/api/worlds/${id}`,),
    );
    const worldAfter = (await gotAfter.json()) as { lore: string | null };
    expect(worldAfter.lore,).toBe("Updated lore.",);
  });

  test("create without lore stores NULL (no schema regression)", async () => {
    const app = appWithAuth(db, ownerId, "user",);

    const createRes = await app.handle(
      new Request(`${BASE}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "NoLoreWorld", },),
      },),
    );
    expect(createRes.status,).toBe(201,);
    const { id, } = await createRes.json() as { id: string };

    const got = await app.handle(
      new Request(`${BASE}/api/worlds/${id}`,),
    );
    const world = (await got.json()) as { lore: string | null };
    expect(world.lore,).toBeNull();
  });
});
