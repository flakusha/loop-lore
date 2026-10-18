// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit coverage for the faction + diplomacy endpoints. These routes
 * previously had no unit suite (browser e2e only), which left the split
 * files under the diff-scoped per-file coverage floor.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { WorldVisibility, } from "../../db/enums-story/world";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { createFaction, FactionError, } from "../../worlds/factions";
import { declareWar, } from "../../worlds/factions-diplomacy";
import { factionRoutes, } from "./faction-routes";
import {
  DataResponse,
  DIPLOMACY_ROUTES,
  Errors,
  factionErrorResponse,
  PairBody,
  requireFactionsInWorld,
  runDiplomacy,
} from "./faction-routes-shared";

const W1 = "w1";
const W2 = "w2";
const USER_A = "user-a";
const USER_B = "user-b";
const ACTOR_A = "actor-a";
const ACTOR_B = "actor-b";

let db: Kysely<DB>;
let guards = "";
let traders = "";
let foreignFaction = "";

/** Mount the real routes behind a session identity, as the app wires them. */
function appFor(userId: string,): Elysia {
  return new Elysia()
    .derive({ as: "scoped", }, () => ({ userId, userRole: "user", }),)
    .use(factionRoutes({ database: db, config: {} as Config, },),) as unknown as Elysia;
}

function request(
  userId: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  return appFor(userId,).handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json", },
      body: body === undefined ? undefined : JSON.stringify(body,),
    },),
  );
}

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "Alice", "Alice", { id: USER_A, },);
  await insertUsers(db, "Bob", "Bob", { id: USER_B, },);
  await insertWorlds(db, USER_A, "World One", { id: W1, visibility: WorldVisibility.Public, },);
  await insertWorlds(db, USER_B, "World Two", { id: W2, visibility: WorldVisibility.Public, },);
  await insertActors(db, "Alice Actor", { id: ACTOR_A, user_id: USER_A, },);
  await insertActors(db, "Bob Actor", { id: ACTOR_B, user_id: USER_B, },);
  guards = (await createFaction({ db, worldId: W1, name: "Guard", },)).id;
  traders = (await createFaction({ db, worldId: W1, name: "Traders", },)).id;
  foreignFaction = (await createFaction({ db, worldId: W2, name: "Compact", },)).id;
},);

afterEach(async () => {
  await db.destroy();
},);

describe("faction CRUD + membership routes", () => {
  test("lists a world's factions", async () => {
    const res = await request(USER_A, "GET", `/api/worlds/${W1}/factions`,);
    expect(res.status,).toBe(200,);

    const body = await res.json() as { data: Array<{ id: string }> };
    expect(body.data.map((f,) => f.id),).toContain(guards,);
  });

  test("creates a faction for the world owner", async () => {
    const res = await request(USER_A, "POST", `/api/worlds/${W1}/factions`, { name: "Scouts", },);
    expect(res.status,).toBe(201,);

    const body = await res.json() as { id: string };
    expect(body.id.length,).toBeGreaterThan(0,);
  });

  test("rejects a blank faction name with 400", async () => {
    // " " passes the body schema's minLength but trims to blank in the
    // service — the FactionError path through factionErrorResponse.
    const res = await request(USER_A, "POST", `/api/worlds/${W1}/factions`, { name: "   ", },);
    expect(res.status,).toBe(400,);
  });

  test("seats an owned actor and refuses another user's actor", async () => {
    const seat = await request(
      USER_A,
      "POST",
      `/api/worlds/${W1}/factions/${guards}/members`,
      { actorId: ACTOR_A, },
    );

    expect(seat.status,).toBe(201,);

    // resolveActorAccess: user A cannot inject user B's actor by id.
    const injected = await request(
      USER_A,
      "POST",
      `/api/worlds/${W1}/factions/${guards}/members`,
      { actorId: ACTOR_B, },
    );

    expect(injected.status,).toBeGreaterThanOrEqual(400,);
    expect(injected.status,).not.toBe(201,);
  });

  test("removes a seated member and 404s a non-member", async () => {
    await request(USER_A, "POST", `/api/worlds/${W1}/factions/${guards}/members`, { actorId: ACTOR_A, },);

    const removed = await request(
      USER_A,
      "DELETE",
      `/api/worlds/${W1}/factions/${guards}/members/${ACTOR_A}`,
    );

    expect(removed.status,).toBe(200,);

    const stranger = await request(
      USER_A,
      "DELETE",
      `/api/worlds/${W1}/factions/${guards}/members/${ACTOR_B}`,
    );

    expect(stranger.status,).toBe(404,);
  });
});

describe("relationship + diplomacy routes", () => {
  test("an unset relationship answers 404", async () => {
    const res = await request(USER_A, "GET", `/api/worlds/${W1}/factions/${guards}/relationships/${traders}`,);
    expect(res.status,).toBe(404,);
  });

  test("sets a status and reads the relationship back", async () => {
    const set = await request(USER_A, "POST", `/api/worlds/${W1}/factions/relationships`, {
      factionA: guards,
      factionB: traders,
      status: "neutral",
    },);

    expect(set.status,).toBe(200,);

    const read = await request(USER_A, "GET", `/api/worlds/${W1}/factions/${guards}/relationships/${traders}`,);
    expect(read.status,).toBe(200,);
  });

  test("declare war runs the diplomacy verb for the world owner", async () => {
    const res = await request(USER_A, "POST", `/api/worlds/${W1}/factions/relationships/war`, {
      factionA: guards,
      factionB: traders,
    },);

    expect(res.status,).toBe(200,);

    const body = await res.json() as { data: { status: string } };
    expect(body.data.status,).toBe("at_war",);
  });

  test("diplomacy refuses a non-owner and a foreign faction pair", async () => {
    // USER_B does not own W1 — the world-owner guard inside runDiplomacy.
    const nonOwner = await request(USER_B, "POST", `/api/worlds/${W1}/factions/relationships/war`, {
      factionA: guards,
      factionB: traders,
    },);

    expect(nonOwner.status,).toBe(403,);

    // The pair must live in the path's world, not just exist.
    const foreign = await request(USER_A, "POST", `/api/worlds/${W1}/factions/relationships/war`, {
      factionA: guards,
      factionB: foreignFaction,
    },);

    expect(foreign.status,).toBe(404,);
  });
});

describe("faction-routes-shared surface", () => {
  test("DIPLOMACY_ROUTES mounts the four verbs, each drivable through its transition", async () => {
    expect(DIPLOMACY_ROUTES.map((r,) => r.path),).toEqual(["war", "peace", "alliance", "alliance/break",],);

    // war → peace on one pair (proposePeace requires at_war).
    const war = await request(USER_A, "POST", `/api/worlds/${W1}/factions/relationships/war`, {
      factionA: guards,
      factionB: traders,
    },);

    expect(war.status,).toBe(200,);

    const peace = await request(USER_A, "POST", `/api/worlds/${W1}/factions/relationships/peace`, {
      factionA: guards,
      factionB: traders,
    },);

    expect(peace.status,).toBe(200,);

    // alliance → break on a fresh pair (break requires allied).
    const scouts = (await createFaction({ db, worldId: W1, name: "Scouts", },)).id;

    const alliance = await request(USER_A, "POST", `/api/worlds/${W1}/factions/relationships/alliance`, {
      factionA: guards,
      factionB: scouts,
    },);

    expect(alliance.status,).toBe(200,);

    const broken = await request(
      USER_A,
      "POST",
      `/api/worlds/${W1}/factions/relationships/alliance/break`,
      { factionA: guards, factionB: scouts, },
    );

    expect(broken.status,).toBe(200,);
  });

  test("PairBody and the shared response envelopes carry the route contract", () => {
    expect(Object.keys(PairBody.properties ?? {},),).toContain("factionA",);
    expect(Object.keys(DataResponse,),).toEqual(["200",],);
    expect(Object.keys(Errors,),).toEqual(["400", "401", "403", "404",],);
  });

  test("requireFactionsInWorld only accepts factions of the path world", async () => {
    expect(await requireFactionsInWorld(db, W1, [guards, traders,],),).toBeNull();

    const denial = await requireFactionsInWorld(db, W1, [foreignFaction,],);

    expect(denial,).toBeInstanceOf(Response,);
    expect(denial?.status,).toBe(404,);
  });

  test("factionErrorResponse maps FactionError codes and rethrows the rest", () => {
    expect(factionErrorResponse(new FactionError("not-found", "gone",),).status,).toBe(404,);

    expect(factionErrorResponse(new FactionError("invalid-input", "bad",),).status,).toBe(400,);

    expect(() => factionErrorResponse(new Error("boom",),)).toThrow("boom",);
  });

  test("runDiplomacy applies the verb behind the world-owner guard", async () => {
    const res = await runDiplomacy(
      db,
      {
        userId: USER_A,
        userRole: "user",
        params: { worldId: W1, },
        body: { factionA: guards, factionB: traders, },
      },
      declareWar,
    );

    expect(res.status,).toBe(200,);

    const body = await res.json() as { data: { status: string } };

    expect(body.data.status,).toBe("at_war",);
  });
});
