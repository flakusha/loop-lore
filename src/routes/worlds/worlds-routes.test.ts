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

describe("worldRoutes — RPG opt-in flags", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    ownerId = uid();
    await insertUsers(db, "rpg-owner", "Rpg Owner", { id: ownerId, } as never,);
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

  type Flags = {
    rpg_enabled: number;
    rpg_dice: number;
    rpg_checks: number;
    rpg_combat: number;
    rpg_xp: number;
    rpg_loot: number;
    rpg_quests: number;
  };

  /**
   * @param id
   */
  async function readFlags(app: Elysia, id: string,): Promise<Flags> {
    const got = await app.handle(new Request(`${BASE}/api/worlds/${id}`,),);
    expect(got.status,).toBe(200,);
    const world = (await got.json()) as Flags;
    const { rpg_enabled, rpg_dice, rpg_checks, rpg_combat, rpg_xp, rpg_loot, rpg_quests, } = world;
    return { rpg_enabled, rpg_dice, rpg_checks, rpg_combat, rpg_xp, rpg_loot, rpg_quests, };
  }

  test("create without flags leaves every mechanic off", async () => {
    const app = appWithAuth(db, ownerId, "user",);
    const res = await app.handle(
      new Request(`${BASE}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "Plain World", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = (await res.json()) as { id: string };
    expect(await readFlags(app, id,),).toEqual({
      rpg_enabled: 0,
      rpg_dice: 0,
      rpg_checks: 0,
      rpg_combat: 0,
      rpg_xp: 0,
      rpg_loot: 0,
      rpg_quests: 0,
    },);
  });

  test("create with rpgEnabled arms every mechanic", async () => {
    const app = appWithAuth(db, ownerId, "user",);
    const res = await app.handle(
      new Request(`${BASE}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "Rpg World", rpgEnabled: true, },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = (await res.json()) as { id: string };
    expect(await readFlags(app, id,),).toEqual({
      rpg_enabled: 1,
      rpg_dice: 1,
      rpg_checks: 1,
      rpg_combat: 1,
      rpg_xp: 1,
      rpg_loot: 1,
      rpg_quests: 1,
    },);
  });

  test("update can enable RPG and opt one mechanic back out", async () => {
    const app = appWithAuth(db, ownerId, "user",);
    const res = await app.handle(
      new Request(`${BASE}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "Mixed World", },),
      },),
    );
    const { id, } = (await res.json()) as { id: string };
    const upd = await app.handle(
      new Request(`${BASE}/api/worlds/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ rpgEnabled: 1, rpgCombat: false, },),
      },),
    );
    expect(upd.status,).toBe(200,);
    expect(await readFlags(app, id,),).toEqual({
      rpg_enabled: 1,
      rpg_dice: 1,
      rpg_checks: 1,
      rpg_combat: 0,
      rpg_xp: 1,
      rpg_loot: 1,
      rpg_quests: 1,
    },);
  });

  test("update can disarm RPG entirely", async () => {
    const app = appWithAuth(db, ownerId, "user",);
    const res = await app.handle(
      new Request(`${BASE}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name: "Off World", rpgEnabled: true, },),
      },),
    );
    const { id, } = (await res.json()) as { id: string };
    const upd = await app.handle(
      new Request(`${BASE}/api/worlds/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ rpgEnabled: false, },),
      },),
    );
    expect(upd.status,).toBe(200,);
    const flags = await readFlags(app, id,);
    expect(Object.values(flags,).every((v,) => v === 0),).toBe(true,);
  });
});
describe("worldRoutes — list visibility + delete", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    ownerId = uid();
    await insertUsers(db, "list-owner", "List Owner", { id: ownerId, } as never,);
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

  /**
   * @param app
   * @param body
   */
  async function createWorld(app: Elysia, body: Record<string, unknown>,): Promise<string> {
    const res = await app.handle(
      new Request(`${BASE}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = (await res.json()) as { id: string };
    return id;
  }

  test("anonymous callers see only public worlds; owners see their own too", async () => {
    const app = appWithAuth(db, ownerId, "user",);
    // NOTE: visibility must be explicit — Elysia's normalizer fills an
    // omitted enum with its first variant ("public"), so the handler's
    // Private fallback only applies to direct calls.
    const ownedId = await createWorld(app, { name: "Private Realm", visibility: "private", },);
    const publicId = await createWorld(app, { name: "Public Realm", visibility: "public", },);

    const anon = appWithAuth(db, null, null,);
    const anonRes = await anon.handle(new Request(`${BASE}/api/worlds`,),);
    expect(anonRes.status,).toBe(200,);
    const anonIds = ((await anonRes.json()) as { data: { id: string }[] }).data.map((w,) => w.id);
    expect(anonIds,).toContain(publicId,);
    expect(anonIds,).not.toContain(ownedId,);

    const ownerRes = await app.handle(new Request(`${BASE}/api/worlds`,),);
    expect(ownerRes.status,).toBe(200,);
    const ownerIds = ((await ownerRes.json()) as { data: { id: string }[] }).data.map((w,) => w.id);
    expect(ownerIds,).toContain(ownedId,);
    expect(ownerIds,).toContain(publicId,);
  });

  test("owner can delete their world; deleted worlds leave the list", async () => {
    const app = appWithAuth(db, ownerId, "user",);
    const id = await createWorld(app, { name: "Doomed Realm", },);
    const del = await app.handle(new Request(`${BASE}/api/worlds/${id}`, { method: "DELETE", },),);
    expect(del.status,).toBe(204,);
    const listed = await app.handle(new Request(`${BASE}/api/worlds`,),);
    const ids = ((await listed.json()) as { data: { id: string }[] }).data.map((w,) => w.id);
    expect(ids,).not.toContain(id,);
  });
});
