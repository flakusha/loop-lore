// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for src/routes/nsfw/fantasies.ts — covers the four fantasy
 * surfaces: GET /api/nsfw/fantasies/:actorId, POST /api/nsfw/fantasies,
 * POST /api/nsfw/fantasies/discover, and POST /api/nsfw/fantasies/:id/explore.
 *
 * Edge classes: unauthenticated (401), non-owner (403), NSFW disabled (403),
 * empty result sets, discovery roll boundaries (Math.random pinned), already-known
 * short-circuit, and exploration of a missing fantasy (success: false).
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
import { fantasyRoutes, } from "./fantasies";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "warn", },);
  ({ db, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(() => {
  // The fantasy service mutators assert against the runtime-config singleton;
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
  const userId = `fantasies-test-user-${id}`;
  const actorId = `fantasies-test-actor-${id}`;
  await insertUsers(db, userId, `Fantasies Test User ${id}`, {
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
  const app = new Elysia({ name: "test-fantasies", },);
  if (userId) {
    app.derive(() => ({ userId, userRole: "user", }));
  }

  return app.use(fantasyRoutes({ database: db, config, },),);
}

/** Pin Math.random for the duration of a discovery test. */
function pinRandom(value: number,): () => void {
  const original = Math.random;
  Math.random = () => value;
  return () => {
    Math.random = original;
  };
}

describe("fantasy routes — GET /api/nsfw/fantasies/:actorId", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/fantasies/fantasies-test-actor-x",),
    );

    expect(res.status,).toBe(401,);
  });

  test("owner with no fantasies → 200 empty array", async () => {
    const { userId, actorId, } = await seedAuthorized("getempty",);
    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/fantasies/${actorId}`,),
    );

    expect(res.status,).toBe(200,);
    expect(await res.json(),).toEqual([],);
  });

  test("owner with existing fantasies → 200 lists them", async () => {
    const { userId, actorId, } = await seedAuthorized("getlist",);
    const app = makeApp(userId,);
    // Seed two fantasies through the create surface.
    for (const name of ["Bondage", "Roleplay",]) {
      const createRes = await app.handle(
        new Request("http://localhost/api/nsfw/fantasies", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ actorId, name, category: "bondage", intensity: "mild", },),
        },),
      );

      expect(createRes.status,).toBe(200,);
    }

    const res = await app.handle(
      new Request(`http://localhost/api/nsfw/fantasies/${actorId}`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as unknown[];
    expect(body,).toHaveLength(2,);
  });

  test("non-owner → 403", async () => {
    const { actorId, } = await seedAuthorized("getnonowner",);
    await insertUsers(db, "fantasies-other", "Other", {
      id: "fantasies-other" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);

    const res = await makeApp("fantasies-other",).handle(
      new Request(`http://localhost/api/nsfw/fantasies/${actorId}`,),
    );

    expect(res.status,).toBe(403,);
  });

  test("NSFW disabled → 403", async () => {
    const { userId, actorId, } = await seedAuthorized("getdisabled",);
    const res = await makeApp(userId, makeConfig({ allowNsfw: false, },),).handle(
      new Request(`http://localhost/api/nsfw/fantasies/${actorId}`,),
    );

    expect(res.status,).toBe(403,);
  });
});

describe("fantasy routes — POST /api/nsfw/fantasies", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/fantasies", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId: "x", name: "N", },),
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("owner creates a fantasy → 200 with persisted row", async () => {
    const { userId, actorId, } = await seedAuthorized("create",);
    const res = await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/fantasies", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          actorId,
          name: "Praise Kink",
          category: "praise",
          intensity: "moderate",
          discoveredThrough: "encounter",
        },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.name,).toBe("Praise Kink",);
    expect(body.actorId,).toBe(actorId,);
    expect(body.intensity,).toBe("moderate",);
    expect(body.timesExplored,).toBe(0,);

    const row = await db
      .selectFrom("character_fantasies",)
      .select("fantasy_name",)
      .where("actor_id", "=", actorId,)
      .executeTakeFirst();

    expect(row?.fantasy_name,).toBe("Praise Kink",);
  });

  test("non-owner → 403", async () => {
    const { actorId, } = await seedAuthorized("createnonowner",);
    await insertUsers(db, "fantasies-other-create", "Other", {
      id: "fantasies-other-create" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);

    const res = await makeApp("fantasies-other-create",).handle(
      new Request("http://localhost/api/nsfw/fantasies", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, name: "N", },),
      },),
    );

    expect(res.status,).toBe(403,);
  });
});

describe("fantasy routes — POST /api/nsfw/fantasies/discover", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/fantasies/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId: "x", context: "y", },),
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("lucky roll → discovered: true with a new fantasy", async () => {
    const { userId, actorId, } = await seedAuthorized("discoverhit",);
    const restore = pinRandom(0,);
    try {
      const res = await makeApp(userId,).handle(
        new Request("http://localhost/api/nsfw/fantasies/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ actorId, context: "bondage and restraint play", },),
        },),
      );

      expect(res.status,).toBe(200,);
      const body = await res.json() as Record<string, unknown>;
      expect(body.discovered,).toBe(true,);
      expect(body.fantasy,).toBeDefined();
    } finally {
      restore();
    }
  });

  test("unlucky roll → discovered: false, no row written", async () => {
    const { userId, actorId, } = await seedAuthorized("discovermiss",);
    const restore = pinRandom(0.99,);
    try {
      const res = await makeApp(userId,).handle(
        new Request("http://localhost/api/nsfw/fantasies/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ actorId, context: "bondage and restraint play", },),
        },),
      );

      expect(res.status,).toBe(200,);
      const body = await res.json() as Record<string, unknown>;
      expect(body.discovered,).toBe(false,);
      expect(body.reason,).toBe("No discovery this time",);

      const count = await db
        .selectFrom("character_fantasies",)
        .select("id",)
        .where("actor_id", "=", actorId,)
        .execute();

      expect(count,).toHaveLength(0,);
    } finally {
      restore();
    }
  });

  test("context matching an existing fantasy name → already known", async () => {
    const { userId, actorId, } = await seedAuthorized("discoverknown",);
    // Seed a fantasy whose name appears in the discovery context.
    await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/fantasies", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, name: "Bondage", category: "bondage", },),
      },),
    );

    const restore = pinRandom(0,);
    try {
      const res = await makeApp(userId,).handle(
        new Request("http://localhost/api/nsfw/fantasies/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ actorId, context: "bondage session", },),
        },),
      );

      expect(res.status,).toBe(200,);
      const body = await res.json() as Record<string, unknown>;
      expect(body.discovered,).toBe(false,);
      expect(body.reason,).toBe("Already known",);
    } finally {
      restore();
    }
  });

  test("non-owner → 403", async () => {
    const { actorId, } = await seedAuthorized("discovernonowner",);
    await insertUsers(db, "fantasies-other-discover", "Other", {
      id: "fantasies-other-discover" as never,
      birth_date: "1990-01-01",
      age_gate_accepted_at: "2026-01-01T00:00:00Z",
    },);

    const res = await makeApp("fantasies-other-discover",).handle(
      new Request("http://localhost/api/nsfw/fantasies/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, context: "bondage", },),
      },),
    );

    expect(res.status,).toBe(403,);
  });
});

describe("fantasy routes — POST /api/nsfw/fantasies/:id/explore", () => {
  test("unauthenticated → 401", async () => {
    const res = await makeApp().handle(
      new Request("http://localhost/api/nsfw/fantasies/missing-id/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("exploring a missing fantasy → success: false", async () => {
    const { userId, } = await seedAuthorized("exploremissing",);
    const res = await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/fantasies/no-such-fantasy/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ feeling: "love", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success,).toBe(false,);
  });

  test("exploring an existing fantasy → success: true, counter increments", async () => {
    const { userId, actorId, } = await seedAuthorized("explorehit",);
    const createRes = await makeApp(userId,).handle(
      new Request("http://localhost/api/nsfw/fantasies", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, name: "Voyeurism", category: "voyeurism", },),
      },),
    );

    const fantasy = await createRes.json() as Record<string, unknown>;

    const res = await makeApp(userId,).handle(
      new Request(`http://localhost/api/nsfw/fantasies/${String(fantasy.id,)}/explore`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ feeling: "like", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success,).toBe(true,);

    const row = await db
      .selectFrom("character_fantasies",)
      .select(["times_explored", "current_feeling",],)
      .where("id", "=", String(fantasy.id,),)
      .executeTakeFirst();

    expect(row?.times_explored,).toBe(1,);
    expect(row?.current_feeling,).toBe("like",);
  });

  test("NSFW disabled → 403", async () => {
    const { userId, } = await seedAuthorized("exploredisabled",);
    const res = await makeApp(userId, makeConfig({ allowNsfw: false, },),).handle(
      new Request("http://localhost/api/nsfw/fantasies/any-id/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );

    expect(res.status,).toBe(403,);
  });
});
