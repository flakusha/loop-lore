// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Round-trip tests for the world autonomy layer (TASK-autonomy-config-surface).
 *
 * Each case asserts the observable column, not the request echo: the world
 * would silently keep ticking on the default preset while the settings page
 * showed a saved setting. Covers the three ways the field can be wrong -
 * dropped (unrelated update), mangled (NOT NULL clear), or rejected (invalid
 * JSON) - plus the ownership guard.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";

import type { Kysely, } from "kysely";
import { EMPTY_AUTONOMY_OVERRIDE, } from "../../autonomy/config";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import type { HandleOpts, } from "./types";
import { worldRoutes, } from "./worlds-routes";

import { autonomyUpdate, } from "./autonomy-config";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const BASE = "http://localhost";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function appWithAuth(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-worlds-autonomy-config", },)
    .derive(() => ({ userId, userRole, }))
    .use(worldRoutes({ database: db, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
}

describe("PUT /api/worlds/:worldId — autonomyConfig", () => {
  let db: Kysely<DB>;
  let sqlite: TestDb["sqlite"];
  let ownerId: string;
  let app: Elysia;

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
    app = appWithAuth(db, ownerId, "user",);
  },);

  afterAll(async () => {
    await sqlite.close();
  },);

  /**
   * @param name
   * @returns the new world's id
   */
  async function createWorld(name: string,): Promise<string> {
    const res = await app.handle(
      new Request(`${BASE}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ name, },),
      },),
    );
    expect(res.status,).toBe(201,);
    return ((await res.json()) as { id: string }).id;
  }

  /**
   * @param worldId
   * @param body
   * @returns the raw PUT response
   */
  async function put(worldId: string, body: Record<string, unknown>,): Promise<Response> {
    return app.handle(
      new Request(`${BASE}/api/worlds/${worldId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );
  }

  /**
   * @param worldId
   * @returns the stored autonomy_config column, or null
   */
  async function readColumn(worldId: string,): Promise<string | null> {
    const row = await db
      .selectFrom("worlds",)
      .select("autonomy_config",)
      .where("id", "=", worldId,)
      .executeTakeFirst();
    return row?.autonomy_config ?? null;
  }

  test("an object body is stored as JSON and returned by GET", async () => {
    const worldId = await createWorld("Autonomy Object",);
    const cfg = { preset: "brisk", tickIntervalMs: 10000, perAgentCap: 4, };

    const res = await put(worldId, { autonomyConfig: cfg, },);
    expect(res.status,).toBe(200,);

    expect(JSON.parse((await readColumn(worldId,)) ?? "null",),).toEqual(cfg,);

    // The GET path must surface it too, or the settings page cannot pre-fill.
    const got = await app.handle(new Request(`${BASE}/api/worlds/${worldId}`,),);
    expect(got.status,).toBe(200,);
    const world = (await got.json()) as { autonomy_config: string | null };
    expect(JSON.parse(world.autonomy_config ?? "null",),).toEqual(cfg,);
  });

  test("a JSON string body is stored verbatim", async () => {
    const worldId = await createWorld("Autonomy String",);
    const raw = '{"preset":"serene"}';

    const res = await put(worldId, { autonomyConfig: raw, },);
    expect(res.status,).toBe(200,);
    expect(await readColumn(worldId,),).toBe(raw,);
  });

  test("null clears the world layer without deleting the world", async () => {
    const worldId = await createWorld("Autonomy Cleared",);
    await put(worldId, { autonomyConfig: { preset: "organic", }, },);
    expect(await readColumn(worldId,),).not.toBe("{}",);

    const res = await put(worldId, { autonomyConfig: null, },);
    expect(res.status,).toBe(200,);
    // The column is NOT NULL; "cleared" is the empty object the resolver
    // reads as no override, not SQL NULL.
    expect(await readColumn(worldId,),).toBe("{}",);
  });

  test("an omitted field leaves the stored override untouched", async () => {
    const worldId = await createWorld("Autonomy Preserved",);
    const cfg = { preset: "brisk", };
    await put(worldId, { autonomyConfig: cfg, },);

    // An unrelated edit (the settings page submits several fields at once)
    // must not wipe autonomy.
    const res = await put(worldId, { name: "Renamed", },);
    expect(res.status,).toBe(200,);
    expect(JSON.parse((await readColumn(worldId,)) ?? "null",),).toEqual(cfg,);
  });

  test("invalid JSON is rejected with 400 and leaves the column unchanged", async () => {
    const worldId = await createWorld("Autonomy Invalid",);
    const cfg = { preset: "organic", };
    await put(worldId, { autonomyConfig: cfg, },);

    const res = await put(worldId, { autonomyConfig: "{not json", },);
    expect(res.status,).toBe(400,);
    // Rejecting the write must not destroy the previously stored value.
    expect(JSON.parse((await readColumn(worldId,)) ?? "null",),).toEqual(cfg,);
  });

  test("a non-owner cannot alter the autonomy layer", async () => {
    const worldId = await createWorld("Autonomy Guarded",);
    const strangerId = uid();
    await insertUsers(db, "stranger", "Stranger", { id: strangerId, } as never,);
    await insertActors(db, strangerId, {
      id: strangerId,
      actor_type: "user",
      user_id: strangerId,
      owner_id: strangerId,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
    } as never,);

    const strangerApp = appWithAuth(db, strangerId, "user",);
    const res = await strangerApp.handle(
      new Request(`${BASE}/api/worlds/${worldId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ autonomyConfig: { preset: "brisk", }, },),
      },),
    );
    expect(res.status,).toBe(403,);
    // Untouched default: no override was written by the rejected call.
    expect(await readColumn(worldId,),).toBe("{}",);
  });
});

/**
 * `autonomyUpdate` is a trust-boundary normaliser: whatever a client puts in
 * the `autonomyConfig` field becomes a TEXT column the resolver later parses.
 * The routes above only ever send shapes the settings page produces, so the
 * non-object rejections never run through HTTP — they are pinned here
 * directly, since accepting one would write a value the resolver silently
 * discards (or a NOT NULL violation) with no visible error.
 */
describe("autonomyUpdate — direct normaliser contract", () => {
  /**
   * @param r
   * @returns the response status, or null when the value was accepted
   */
  async function statusOf(r: ReturnType<typeof autonomyUpdate>,): Promise<number | null> {
    return r.ok ? null : r.error.status;
  }

  test("an absent field yields undefined so the caller skips the column", () => {
    const r = autonomyUpdate(undefined,);
    expect(r.ok,).toBe(true,);
    if (!r.ok) { return; }
    expect(r.value,).toBeUndefined();
  });

  test("null clears the world layer with the empty override, not SQL NULL", () => {
    const r = autonomyUpdate(null,);
    expect(r.ok,).toBe(true,);
    if (!r.ok) { return; }
    // The column is NOT NULL DEFAULT '{}' and the resolver reads {} as
    // "no override"; writing SQL NULL would violate the constraint.
    expect(r.value,).toBe(EMPTY_AUTONOMY_OVERRIDE,);
    expect(r.value,).not.toBeNull();
  });

  test("a bare number is a 400: the resolver would read a non-object", async () => {
    const r = autonomyUpdate(42,);
    expect(await statusOf(r,),).toBe(400,);
    if (r.ok) { return; }
    const body = await r.error.json() as { error: string };
    expect(body.error,).toBe("autonomyConfig must be an object or JSON string",);
  });

  test("a boolean is a 400 for the same reason", async () => {
    expect(await statusOf(autonomyUpdate(true,),),).toBe(400,);
  });
});
