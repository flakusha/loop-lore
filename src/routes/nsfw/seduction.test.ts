// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for src/routes/nsfw/seduction.ts — covers the six seduction
 * surfaces: GET/PUT /api/nsfw/desire/:actorId, GET /api/nsfw/skills/:actorId,
 * POST /api/nsfw/seduction/attempt, and GET/POST /api/nsfw/arousal/:actorId.
 *
 * Edge classes: unauthenticated (401), non-owner (403), NSFW disabled (403),
 * default profile creation, profile update persistence, arousal delta
 * clamping, and world-scoped arousal reads.
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
import { seductionRoutes, } from "./seduction";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "warn", },);
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(() => {
  // Seduction service mutators assert against the runtime-config singleton;
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
  const userId = `seduction-test-user-${id}`;
  const actorId = `seduction-test-actor-${id}`;
  await insertUsers(db, userId, `Seduction Test User ${id}`, {
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
  const app = new Elysia({ name: "test-seduction", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }

  return app.use(seductionRoutes({ database: db, config, },),);
}

describe("seduction routes — GET /api/nsfw/desire/:actorId", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/desire/seduction-test-actor-x",),
    );

    expect(res.status,).toBe(401,);
  });

  test("owner → 200 with default profile", async () => {
    const { userId, actorId, } = await seedAuthorized("getdesire",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/desire/${actorId}`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.actorId,).toBe(actorId,);
    expect(body.turnOns,).toEqual([],);
    expect(body.currentDesire,).toBe(0,);
  });

  test("non-owner → 403", async () => {
    const { actorId, } = await seedAuthorized("getdesirenonowner",);
    await insertUsers(db, "seduction-other", "Other", {
      id: "seduction-other" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);

    const res = await makeApp("seduction-other",).handle(
      new Request(`http://localhost/api/nsfw/desire/${actorId}`,),
    );

    expect(res.status,).toBe(403,);
  });

  test("NSFW disabled → 403", async () => {
    const { userId, actorId, } = await seedAuthorized("getdesiredisabled",);
    const res = await makeApp(userId, makeConfig({ allowNsfw: false, },),).handle(
      new Request(`http://localhost/api/nsfw/desire/${actorId}`,),
    );

    expect(res.status,).toBe(403,);
  });
});

describe("seduction routes — PUT /api/nsfw/desire/:actorId", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/desire/seduction-test-actor-x", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ turnOns: ["praise",], },),
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("owner updates profile → 200, DB persisted", async () => {
    const { userId, actorId, } = await seedAuthorized("putdesire",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/desire/${actorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ turnOns: ["praise", "touch",], desireDecayRate: 2, },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success,).toBe(true,);

    const row = await db
      .selectFrom("character_desire_profile",)
      .select(["turn_ons", "desire_decay_rate",],)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();

    expect(row?.turn_ons,).toBe(JSON.stringify(["praise", "touch",],),);
    expect(row?.desire_decay_rate,).toBe(2,);
  });

  test("non-owner → 403", async () => {
    const { actorId, } = await seedAuthorized("putdesirenonowner",);
    await insertUsers(db, "seduction-other-put", "Other", {
      id: "seduction-other-put" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);

    const res = await makeApp("seduction-other-put",).handle(
      new Request(`http://localhost/api/nsfw/desire/${actorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ turnOns: [], },),
      },),
    );

    expect(res.status,).toBe(403,);
  });
});

describe("seduction routes — GET /api/nsfw/skills/:actorId", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/skills/seduction-test-actor-x",),
    );

    expect(res.status,).toBe(401,);
  });

  test("owner → 200 with skills array", async () => {
    const { userId, actorId, } = await seedAuthorized("getskills",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/skills/${actorId}`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body,),).toBe(true,);
  });

  test("non-owner → 403", async () => {
    const { actorId, } = await seedAuthorized("getskillsnonowner",);
    await insertUsers(db, "seduction-other-skills", "Other", {
      id: "seduction-other-skills" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);

    const res = await makeApp("seduction-other-skills",).handle(
      new Request(`http://localhost/api/nsfw/skills/${actorId}`,),
    );

    expect(res.status,).toBe(403,);
  });
});

describe("seduction routes — POST /api/nsfw/seduction/attempt", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/seduction/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId: "x", targetId: "y", approach: "compliment", },),
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("owner attempts seduction → 200 with result", async () => {
    const { userId, actorId, } = await seedAuthorized("attempt",);
    // Target actor (auto-profiles on first read).
    const targetId = "seduction-attempt-target";
    await insertActors(db, "Attempt Target", {
      id: targetId as never,
      owner_id: userId,
      user_id: userId,
    },);

    const res = await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/seduction/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          actorId,
          targetId,
          skillCategory: "seduction",
          approach: "a warm compliment",
        },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body,).toHaveProperty("success",);
    expect(body,).toHaveProperty("roll",);
    expect(body,).toHaveProperty("dc",);
  });

  test("non-owner → 403", async () => {
    const { actorId, } = await seedAuthorized("attemptnonowner",);
    await insertUsers(db, "seduction-other-attempt", "Other", {
      id: "seduction-other-attempt" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);

    const res = await makeApp("seduction-other-attempt",).handle(
      new Request("http://localhost/api/nsfw/seduction/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, targetId: "t", approach: "x", },),
      },),
    );

    expect(res.status,).toBe(403,);
  });
});

describe("seduction routes — GET /api/nsfw/arousal/:actorId", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/arousal/seduction-test-actor-x",),
    );

    expect(res.status,).toBe(401,);
  });

  test("owner → 200 with default arousal state", async () => {
    const { userId, actorId, } = await seedAuthorized("getarousal",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/arousal/${actorId}`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.actorId,).toBe(actorId,);
    expect(body.level,).toBe(0,);
  });

  test("owner with worldId query → 200 world-scoped state", async () => {
    const { userId, actorId, } = await seedAuthorized("getarousalworld",);
    // character_arousal.world_id has an FK to worlds.id — seed the world.
    await insertWorlds(db, userId, "Arousal World", { id: "arousal-world-1" as never, },);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/arousal/${actorId}?worldId=arousal-world-1`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.worldId,).toBe("arousal-world-1",);
  });

  test("non-owner → 403", async () => {
    const { actorId, } = await seedAuthorized("getarousalnonowner",);
    await insertUsers(db, "seduction-other-arousal", "Other", {
      id: "seduction-other-arousal" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);

    const res = await makeApp("seduction-other-arousal",).handle(
      new Request(`http://localhost/api/nsfw/arousal/${actorId}`,),
    );

    expect(res.status,).toBe(403,);
  });
});

describe("seduction routes — POST /api/nsfw/arousal/:actorId", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/arousal/seduction-test-actor-x", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ delta: 5, },),
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("owner increases arousal → 200 with new level", async () => {
    const { userId, actorId, } = await seedAuthorized("postarousal",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/arousal/${actorId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ delta: 10, source: "test", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.level,).toBe(10,);

    const row = await db
      .selectFrom("character_arousal",)
      .select("level",)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();

    expect(row?.level,).toBe(10,);
  });

  test("owner negative delta clamps at 0", async () => {
    const { userId, actorId, } = await seedAuthorized("postarousalclamp",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/arousal/${actorId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ delta: -5, },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.level,).toBe(0,);
  });

  test("non-owner → 403", async () => {
    const { actorId, } = await seedAuthorized("postarousalnonowner",);
    await insertUsers(db, "seduction-other-postarousal", "Other", {
      id: "seduction-other-postarousal" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);

    const res = await makeApp("seduction-other-postarousal",).handle(
      new Request(`http://localhost/api/nsfw/arousal/${actorId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ delta: 5, },),
      },),
    );

    expect(res.status,).toBe(403,);
  });
});
