/**
 * Tests for character-world-setup routes (get / resolve / upsert / delete).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { characterWorldSetupRoutes, } from "./character-world-setup";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const WORLD = "00000000-0000-4000-8000-000000000101";
const WORLD2 = "00000000-0000-4000-8000-000000000102";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-char-world-setup", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(characterWorldSetupRoutes({ database: db, },),);
}

interface SetupBody {
  id?: string;
  actor_id?: string;
  actorId?: string;
  world_id?: string;
  starting_inventory?: string;
  lore_entries?: string;
  backstory?: string | null;
  error?: string;
  scenario?: string | null;
  systemPrompt?: string | null;
  startingInventory?: unknown;
}

describe("character-world-setup routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
    await insertUsers(db, "other", "Other", { id: "other" as never, },);
    await insertWorlds(db, "owner", "World One", { id: WORLD as never, },);
    await insertWorlds(db, "owner", "World Two", { id: "00000000-0000-4000-8000-000000000102" as never, },);
    await insertActors(db, "Hero", {
      id: ACTOR as never,
      owner_id: "owner",
      scenario: "base scenario",
      system_prompt: "base prompt",
    },);
    await insertActors(db, "Other Actor", { id: OTHER as never, owner_id: "other", },);
  },);

  afterAll(() => sqlite.close());

  test("GET requires auth", async () => {
    const res = await makeApp(db,).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`,),
    );
    expect(res.status,).toBe(401,);
  });

  test("GET returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "other", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET returns 404 when no setup exists", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("PUT creates setup bundle with defaults", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ backstory: "orphan from the north", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = await res.json() as SetupBody;
    expect(body.actor_id,).toBe(ACTOR,);
    expect(body.world_id,).toBe(WORLD,);
    expect(body.backstory,).toBe("orphan from the north",);
    expect(body.starting_inventory,).toBe("[]",);
    expect(body.lore_entries,).toBe("[]",);
  });

  test("GET returns the stored setup", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as SetupBody;
    expect(body.backstory,).toBe("orphan from the north",);
  });

  test("PUT merges into existing setup (idempotent upsert)", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          startingInventory: [{ item_id: "sword", quantity: 1, },],
          scenarioOverride: "overridden scenario",
        },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = await res.json() as SetupBody;
    expect(body.starting_inventory,).toContain("sword",);
    expect(body.scenario,).toBeUndefined();

    const row = await db
      .selectFrom("character_world_setup",)
      .select(["scenario_override", "backstory",],)
      .where("actor_id", "=", ACTOR,)
      .executeTakeFirst();
    expect(row?.scenario_override,).toBe("overridden scenario",);
    expect(row?.backstory,).toBe("orphan from the north",); // preserved on merge
  });

  test("GET resolve returns merged base + overlay", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}/resolve`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as SetupBody;
    expect(body.actorId,).toBe(ACTOR,);
    expect(body.scenario,).toBe("overridden scenario",); // overlay wins
    expect(body.systemPrompt,).toBe("base prompt",); // no override → base
    expect(body.startingInventory,).toEqual([{ item_id: "sword", quantity: 1, },],);
  });

  test("GET resolve falls back to base setup without overlay", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD2}/resolve`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as SetupBody;
    expect(body.scenario,).toBe("base scenario",);
    expect(body.systemPrompt,).toBe("base prompt",);
    expect(body.startingInventory,).toEqual([],);
  });

  test("PUT returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "other", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ backstory: "x", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE removes the setup with 204", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(204,);

    const row = await db
      .selectFrom("character_world_setup",)
      .select("id",)
      .where("actor_id", "=", ACTOR,)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("DELETE returns 404 when nothing to delete", async () => {
    const res = await makeApp(db, "owner", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE returns 404 for another user's actor", async () => {
    const res = await makeApp(db, "other", "user",).handle(
      new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  });

  describe("World setup — admin/solo bypass", () => {
    let db: Kysely<DB>;
    let sqlite: Database;

    beforeAll(async () => {
      ({ db, sqlite, } = await createTestDb());
      await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
      await insertActors(db, "Actor A", { id: ACTOR as never, owner_id: "owner", },);
      await insertWorlds(db, "owner", "Test World", { id: WORLD as never, },);
      // Create world setup data
      const app = makeApp(db, "owner", "user",);
      await app.handle(
        new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ scenario: "Test Scenario", },),
        },),
      );
    },);

    afterAll(() => sqlite.close());

    test("admin can GET another user's world setup", async () => {
      const app = makeApp(db, "owner", "admin",);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`,),
      );
      expect(res.status,).toBe(200,);
    });

    test("solo can GET another user's world setup", async () => {
      const app = makeApp(db, "owner", "solo",);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`,),
      );
      expect(res.status,).toBe(200,);
    });

    test("admin can PUT world setup for another user's actor", async () => {
      const app = makeApp(db, "owner", "admin",);
      const res = await app.handle(
        new Request(`http://localhost/api/actors/${ACTOR}/world-setup/${WORLD}`, {
          method: "PUT",
          headers: { "content-type": "application/json", },
          body: JSON.stringify({ scenario: "admin override", },),
        },),
      );
      expect(res.status,).toBe(201,);
    });
  });
});
