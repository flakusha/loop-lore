// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for src/routes/nsfw/encounters.ts — covers GET
 * /api/nsfw/encounters/:id, POST /api/nsfw/encounters/:id/advance, and GET
 * /api/nsfw/encounters/world/:worldId. (POST /api/nsfw/encounters is
 * exercised by the barrel suite in index.test.ts.)
 *
 * Edge classes: unauthenticated (401), missing encounter (404), advance on a
 * missing encounter (complete: true), phase progression, completion, and
 * world-scoped listing.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema/config";
import { NsfwSection, } from "../../config/sections";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { resetNsfwRuntimeConfig, } from "../../nsfw/runtime-config";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { encounterRoutes, } from "./encounters";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "warn", },);
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(() => {
  // Encounter service mutators assert against the runtime-config singleton;
  // reset it so a sibling suite's allowNsfw=false cannot leak into these tests.
  resetNsfwRuntimeConfig();
},);

/**
 * Build an NSFW config fixture (only the nsfw section is read by the gate).
 * @param overrides
 */
function makeConfig(overrides: Partial<Config["nsfw"]> = {},): Config {
  return {
    nsfw: new NsfwSection(overrides,),
  } as unknown as Config;
}

/** Insert a canonical authorised user + owned actor + world (unique per call). */
async function seedAuthorized(id: string,): Promise<{ userId: string; actorId: string; worldId: string }> {
  const userId = `encounters-test-user-${id}`;
  const actorId = `encounters-test-actor-${id}`;
  const worldId = `encounters-test-world-${id}`;
  await insertUsers(db, userId, `Encounters Test User ${id}`, {
    id: userId as never,
    birth_date: "1990-01-01",
    age_gate_accepted_at: "2026-01-01T00:00:00Z",
  },);
  await insertActors(db, actorId, {
    id: actorId as never,
    owner_id: userId,
    user_id: userId,
    content_rating: "nsfw_moderate" as never,
  },);
  await insertWorlds(db, userId, `Encounters Test World ${id}`, { id: worldId as never, },);
  return { userId, actorId, worldId, };
}

/**
 * @param userId optional authenticated user
 * @param config
 */
function makeApp(userId?: string, config: Config = makeConfig(),) {
  const app = new Elysia({ name: "test-encounters", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }
  return app.use(encounterRoutes({ database: db, config, },),);
}

describe("encounter routes — GET /api/nsfw/encounters/:id", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/encounters/enc-x",),
    );
    expect(res.status,).toBe(401,);
  });

  test("authenticated, missing encounter → 404", async () => {
    const { userId, } = await seedAuthorized("getmissing",);
    const res = await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/encounters/no-such-encounter",),
    );
    expect(res.status,).toBe(404,);
  });

  test("authenticated, existing encounter → 200", async () => {
    const { userId, actorId, worldId, } = await seedAuthorized("getexisting",);
    const app = makeApp(userId,);
    const createRes = await app.handle(
      new Request("http://localhost/api/nsfw/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          actorId,
          worldId,
          encounterType: "intimate",
          participants: [actorId,],
        },),
      },),
    );
    expect(createRes.status,).toBe(200,);
    const encounter = await createRes.json() as Record<string, unknown>;

    const res = await app.handle(
      new Request(`http://localhost/api/nsfw/encounters/${String(encounter.id,)}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.id,).toBe(encounter.id,);
    expect(body.status,).toBe("active",);
  });
});

describe("encounter routes — POST /api/nsfw/encounters/:id/advance", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/encounters/enc-x/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("advance on missing encounter → 200 complete: true", async () => {
    const { userId, } = await seedAuthorized("advancemissing",);
    const res = await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/encounters/no-such-encounter/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.complete,).toBe(true,);
  });

  test("advance progresses phases then completes", async () => {
    const { userId, actorId, worldId, } = await seedAuthorized("advancephases",);
    const app = makeApp(userId,);
    const createRes = await app.handle(
      new Request("http://localhost/api/nsfw/encounters", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          actorId,
          worldId,
          encounterType: "intimate",
          participants: [actorId,],
        },),
      },),
    );
    const encounter = await createRes.json() as Record<string, unknown>;
    const encId = String(encounter.id,);

    // Default phases: Foreplay, Main, Aftercare (3 phases).
    const first = await app.handle(
      new Request(`http://localhost/api/nsfw/encounters/${encId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(first.status,).toBe(200,);
    const firstBody = await first.json() as Record<string, unknown>;
    expect(firstBody.complete,).toBe(false,);
    expect(firstBody.phaseIndex,).toBe(1,);

    const second = await app.handle(
      new Request(`http://localhost/api/nsfw/encounters/${encId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(second.status,).toBe(200,);
    const secondBody = await second.json() as Record<string, unknown>;
    expect(secondBody.complete,).toBe(false,);
    expect(secondBody.phaseIndex,).toBe(2,);

    const third = await app.handle(
      new Request(`http://localhost/api/nsfw/encounters/${encId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(third.status,).toBe(200,);
    const thirdBody = await third.json() as Record<string, unknown>;
    expect(thirdBody.complete,).toBe(true,);
    expect(thirdBody.triggeredOutcomes,).toBeDefined();

    const row = await db
      .selectFrom("nsfw_encounters",)
      .select("status",)
      .where("id", "=", encId,)
      .executeTakeFirst();
    expect(row?.status,).toBe("completed",);
  });
});

describe("encounter routes — GET /api/nsfw/encounters/world/:worldId", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/encounters/world/world-x",),
    );
    expect(res.status,).toBe(401,);
  });

  test("authenticated → 200 with world encounters", async () => {
    const { userId, actorId, worldId, } = await seedAuthorized("listworld",);
    const app = makeApp(userId,);
    // Create two encounters in the world.
    for (const type of ["intimate", "casual",]) {
      const createRes = await app.handle(
        new Request("http://localhost/api/nsfw/encounters", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({
            actorId,
            worldId,
            encounterType: type,
            participants: [actorId,],
          },),
        },),
      );
      expect(createRes.status,).toBe(200,);
    }
    const res = await app.handle(
      new Request(`http://localhost/api/nsfw/encounters/world/${worldId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as unknown[];
    expect(body,).toHaveLength(2,);
  });

  test("authenticated, world with no encounters → 200 empty array", async () => {
    const { userId, worldId, } = await seedAuthorized("listworldempty",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/encounters/world/${worldId}`,),
    );
    expect(res.status,).toBe(200,);
    expect(await res.json(),).toEqual([],);
  });
});
