// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/routes/worlds/faction-routes-shared.test.ts — the shared faction scope
 * guard, error mapping and diplomacy dispatch that both ./faction-routes and
 * ./karma-routes route through.
 *
 * The guard is the security-relevant piece: the world gate authorizes
 * `:worldId`, but factions are addressed by their OWN id, so without the
 * faction-in-world check a caller who owns ANY world could read or rewrite
 * another world's factions.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { WorldVisibility, } from "../../db/enums-story/world";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { createFaction, FactionError, } from "../../worlds/factions";
import { declareWar, } from "../../worlds/factions-diplomacy";
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

let db: Kysely<DB>;
let factionInW1 = "";
let factionInW2 = "";

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "Alice", "Alice", { id: USER_A, },);
  await insertUsers(db, "Bob", "Bob", { id: USER_B, },);
  await insertWorlds(db, USER_A, "World One", { id: W1, visibility: WorldVisibility.Public, },);
  await insertWorlds(db, USER_B, "World Two", { id: W2, visibility: WorldVisibility.Public, },);
  factionInW1 = (await createFaction({ db, worldId: W1, name: "Guard", },)).id;
  factionInW2 = (await createFaction({ db, worldId: W2, name: "Compact", },)).id;
},);

afterEach(async () => {
  await db.destroy();
},);

describe("requireFactionsInWorld", () => {
  test("returns null when every faction belongs to the world", async () => {
    const err = await requireFactionsInWorld(db, W1, [factionInW1,],);
    expect(err,).toBeNull();
  });

  test("returns 404 when a faction belongs to another world", async () => {
    const err = await requireFactionsInWorld(db, W1, [factionInW2,],);
    expect(err?.status,).toBe(404,);
  });

  test("returns 404 when a pair mixes one own faction and one foreign one", async () => {
    const err = await requireFactionsInWorld(db, W1, [factionInW1, factionInW2,],);
    expect(err?.status,).toBe(404,);
  });

  test("returns 404 for an id that does not exist at all", async () => {
    const err = await requireFactionsInWorld(db, W1, ["no-such-faction",],);
    expect(err?.status,).toBe(404,);
  });

  test("a duplicated id in one world passes — the guard counts DISTINCT hits", async () => {
    const err = await requireFactionsInWorld(db, W1, [factionInW1, factionInW1,],);
    expect(err,).toBeNull();
  });
});

describe("factionErrorResponse", () => {
  test("maps a not-found FactionError to 404", () => {
    const res = factionErrorResponse(new FactionError("not-found", "no such faction",),);
    expect(res.status,).toBe(404,);
  });

  test("maps every other FactionError code to 400", () => {
    for (const code of ["duplicate", "invalid-transition", "invalid-input", "conflict",] as const) {
      const res = factionErrorResponse(new FactionError(code, "rejected",),);
      expect(res.status, `${code} should map to 400`,).toBe(400,);
    }
  });

  test("rethrows anything that is not a FactionError", () => {
    expect(() => factionErrorResponse(new Error("boom",),)).toThrow("boom",);
  });
});

describe("runDiplomacy", () => {
  /**
   * A minimal Elysia ctx: world-owner auth plus the pair body. `extractAuth`
   * reads userId/userRole off the top level (Elysia `derive` + `scoped`), so
   * the shape has to match that, not `ctx.state`.
   */
  const ctxFor = (worldId: string, factionA: string, factionB: string, userId = USER_A,) => ({
    params: { worldId, },
    body: { factionA, factionB, reason: "because", },
    userId,
    userRole: "user",
  });

  /** A second, DISTINCT faction inside W1, so a pair is two factions. */
  const secondInW1 = async (): Promise<string> =>
    (await createFaction({ db, worldId: W1, name: "Reinforcements", },)).id;

  test("declares war for two factions in the caller's own world", async () => {
    const res = await runDiplomacy(db, ctxFor(W1, factionInW1, await secondInW1(),), declareWar,);

    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { status: string } };
    expect(body.data.status,).toBe("at_war",);
  });

  test("404s a pair that names another world's faction", async () => {
    const res = await runDiplomacy(db, ctxFor(W1, factionInW1, factionInW2,), declareWar,);
    expect(res.status,).toBe(404,);
  });

  test("refuses when the caller does not own the world in the path", async () => {
    // USER_A owns w1 but addresses w2: the world-owner gate short-circuits
    // before the faction scope check ever runs.
    const res = await runDiplomacy(db, ctxFor(W2, factionInW2, await secondInW1(),), declareWar,);
    expect(res.status,).toBe(403,);
  });

  test("404s a non-existent faction id before reaching the verb", async () => {
    const res = await runDiplomacy(db, ctxFor(W1, factionInW1, "no-such-faction",), declareWar,);
    expect(res.status,).toBe(404,);
  });
});

describe("the diplomacy route table", () => {
  test("mounts the four diplomatic verbs at unique paths", () => {
    const paths = DIPLOMACY_ROUTES.map((r,) => r.path);
    expect(paths,).toEqual(["war", "peace", "alliance", "alliance/break",],);
    expect(new Set(paths,).size,).toBe(paths.length,);
  });

  test("every verb is callable and carries the OpenAPI detail the routes echo", () => {
    for (const route of DIPLOMACY_ROUTES) {
      expect(typeof route.verb, `${route.path} must be a function`,).toBe("function",);
      expect(route.summary.length,).toBeGreaterThan(0,);
      expect(route.description.length,).toBeGreaterThan(0,);
    }
  });
});

describe("the shared wire schemas", () => {
  test("PairBody requires both faction ids and bounds the reason", () => {
    const shape = PairBody.properties as Record<string, { type?: string; minLength?: number; maxLength?: number }>;
    expect(shape.factionA?.type,).toBe("string",);
    expect(shape.factionB?.type,).toBe("string",);
    expect(shape.factionA?.minLength,).toBe(1,);
    expect(shape.reason?.maxLength,).toBe(2000,);
  });

  test("the response envelopes carry the 200 data envelope and every error status", () => {
    expect(Object.keys(DataResponse,),).toEqual(["200",],);
    expect(Object.keys(Errors,).sort(),).toEqual(["400", "401", "403", "404",],);
  });
});
