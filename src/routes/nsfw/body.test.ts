// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for src/routes/nsfw/body.ts — covers GET and PUT
 * /api/nsfw/body/:actorId.
 *
 * Edge classes: unauthenticated (401), non-owner (403), NSFW disabled (403),
 * default profile creation, schema validation boundaries (422 for out-of-range
 * numbers and unknown fields), and update persistence.
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
} from "../../test-utils/insert-helpers";
import { bodyRoutes, } from "./body";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "warn", },);
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(() => {
  // The body service mutators assert against the runtime-config singleton;
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

/** Insert a canonical authorised user + owned actor (unique per call). */
async function seedAuthorized(id: string,): Promise<{ userId: string; actorId: string }> {
  const userId = `body-test-user-${id}`;
  const actorId = `body-test-actor-${id}`;
  await insertUsers(db, userId, `Body Test User ${id}`, {
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
  return { userId, actorId, };
}

/**
 * @param userId optional authenticated user
 * @param config
 */
function makeApp(userId?: string, config: Config = makeConfig(),) {
  const app = new Elysia({ name: "test-body", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }
  return app.use(bodyRoutes({ database: db, config, },),);
}

describe("body routes — GET /api/nsfw/body/:actorId", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/body/body-test-actor-x",),
    );
    expect(res.status,).toBe(401,);
  });

  test("owner → 200 with default profile", async () => {
    const { userId, actorId, } = await seedAuthorized("get",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/body/${actorId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.actorId,).toBe(actorId,);
    expect(body.stamina,).toBe(50,);
    expect(body.sizeCategory,).toBe("average",);
    expect(body.scent,).toBeNull();
  });

  test("non-owner → 403", async () => {
    const { actorId, } = await seedAuthorized("getnonowner",);
    await insertUsers(db, "body-other", "Other", {
      id: "body-other" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);
    const res = await makeApp("body-other",).handle(
      new Request(`http://localhost/api/nsfw/body/${actorId}`,),
    );
    expect(res.status,).toBe(403,);
  });

  test("NSFW disabled → 403", async () => {
    const { userId, actorId, } = await seedAuthorized("getdisabled",);
    const res = await makeApp(userId, makeConfig({ allowNsfw: false, },),).handle(
      new Request(`http://localhost/api/nsfw/body/${actorId}`,),
    );
    expect(res.status,).toBe(403,);
  });
});

describe("body routes — PUT /api/nsfw/body/:actorId", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/body/body-test-actor-x", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ stamina: 80, },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("owner updates valid fields → 200, DB persisted", async () => {
    const { userId, actorId, } = await seedAuthorized("put",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/body/${actorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          stamina: 80,
          sizeCategory: "petite",
          build: "athletic",
          scent: "vanilla",
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success,).toBe(true,);

    const row = await db
      .selectFrom("character_body_profile",)
      .select(["stamina", "size_category", "build", "scent",],)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();
    expect(row?.stamina,).toBe(80,);
    expect(row?.size_category,).toBe("petite",);
    expect(row?.build,).toBe("athletic",);
    expect(row?.scent,).toBe("vanilla",);
  });

  test("stamina below schema minimum → 422", async () => {
    const { userId, actorId, } = await seedAuthorized("putbelowmin",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/body/${actorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ stamina: 0, },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("stamina above schema maximum → 422", async () => {
    const { userId, actorId, } = await seedAuthorized("putabovemax",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/body/${actorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ stamina: 101, },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("unknown fields are stripped, not mass-assigned", async () => {
    const { userId, actorId, } = await seedAuthorized("putunknown",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/body/${actorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId: "evil", id: "evil", stamina: 70, },),
      },),
    );
    // TypeBox strips unknown keys; the whitelisted stamina still applies.
    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success,).toBe(true,);

    const row = await db
      .selectFrom("character_body_profile",)
      .select("stamina",)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();
    expect(row?.stamina,).toBe(70,);
  });

  test("non-owner → 403", async () => {
    const { actorId, } = await seedAuthorized("putnonowner",);
    await insertUsers(db, "body-other-put", "Other", {
      id: "body-other-put" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);
    const res = await makeApp("body-other-put",).handle(
      new Request(`http://localhost/api/nsfw/body/${actorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ stamina: 60, },),
      },),
    );
    expect(res.status,).toBe(403,);
  });
});
