// src/routes/world-import.test.ts
//
// Tests for POST /api/import/world and the importWorldBundle helper. Covers a
// real export → import round-trip (via exportStoryToZip) plus the route shape.

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import JSZip from "jszip";
import type { Kysely, } from "kysely";
import type { AuthConfig, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { resetSoloUserCache, } from "../middleware/auth";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { exportStoryToZip, type WorldBundle, } from "./export-shared";
import { importWorldBundle, worldImportRoutes, } from "./world-import";

function createApp(db: Kysely<DB>,): Elysia {
  const auth: AuthConfig = {
    required: false,
    registrationOpen: false,
    sessionTimeoutHours: 24,
    maxSessionsPerUser: 5,
    demoUsername: "demo",
    demoAutoSetup: false,
    jwtSecret: "test-secret",
  };
  return new Elysia({ name: "test-world-import", },)
    .use(worldImportRoutes({ database: db, config: { auth, }, },),);
}

async function exportBundleForWorld(db: Kysely<DB>, userId: string, worldId: string,): Promise<WorldBundle> {
  const zip = new JSZip();
  await exportStoryToZip({
    database: db,
    userId,
    zip,
    checksums: {},
    format: "json",
    counts: {},
  },);
  const raw = await zip.file(`story/${worldId}.json`,)?.async("text",);
  if (!raw) { throw new Error(`No story bundle exported for ${worldId}`,); }
  return JSON.parse(raw,) as WorldBundle;
}

describe("worldImportRoutes — POST /api/import/world", () => {
  let db: Kysely<DB>;
  let userId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    resetSoloUserCache();
    ({ db, } = await createTestDb());
    userId = uid();
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `user-${userId}`,
        display_name: "Test User",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    await db
      .insertInto("actors",)
      .values({
        id: userId,
        actor_type: "user",
        display_name: "Test User",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("export→import round-trips a world: fresh ids, remapped FKs, correct counts", async () => {
    // ── Seed a source world with locations + story state ──────────────────
    const sourceWorldId = uid();
    await db
      .insertInto("worlds",)
      .values({
        id: sourceWorldId,
        owner_id: userId,
        name: "Source Realm",
        description: "A realm",
        difficulty_modifier: 1,
        difficulty_reroll: "none",
        difficulty_state: "normal",
      },)
      .execute();

    const keepId = uid();
    const caveId = uid();
    await db
      .insertInto("locations",)
      .values([
        { id: keepId, world_id: sourceWorldId, name: "Keep", },
        { id: caveId, world_id: sourceWorldId, name: "Cave", parent_location_id: keepId, },
      ],)
      .execute();

    const questId = uid();
    await db
      .insertInto("quests",)
      .values({
        id: questId,
        world_id: sourceWorldId,
        creator_id: userId,
        name: "Find the relic",
        type: "discovery",
        target: 1,
      },)
      .execute();
    await db
      .insertInto("world_lore_entries",)
      .values({
        id: uid(),
        world_id: sourceWorldId,
        content: "The relic lies beneath the Keep.",
      },)
      .execute();
    await db
      .insertInto("world_states",)
      .values({
        id: uid(),
        world_id: sourceWorldId,
        snapshot: "{}",
      },)
      .execute();
    await db
      .insertInto("location_states",)
      .values({
        id: uid(),
        location_id: keepId,
        world_id: sourceWorldId,
        atmosphere: "candlelit",
      },)
      .execute();

    // ── Export the canonical bundle, then import it as a NEW world ────────
    const bundle = await exportBundleForWorld(db, userId, sourceWorldId,);
    const { worldId, counts, } = await importWorldBundle(db, userId, bundle,);

    expect(counts,).toMatchObject({
      world: 1,
      locations: 2,
      world_lore_entries: 1,
      quests: 1,
      world_states: 1,
      location_states: 1,
    },);
    expect(worldId,).not.toBe(sourceWorldId,);

    const world = await db
      .selectFrom("worlds",)
      .selectAll()
      .where("id", "=", worldId,)
      .executeTakeFirst();
    expect(world?.name,).toBe("Source Realm",);
    expect(world?.owner_id,).toBe(userId,);

    const locs = await db
      .selectFrom("locations",)
      .selectAll()
      .where("world_id", "=", worldId,)
      .execute();
    expect(locs,).toHaveLength(2,);
    const keep = locs.find((l,) => l.name === "Keep");
    const cave = locs.find((l,) => l.name === "Cave");
    expect(keep,).toBeDefined();
    expect(cave?.world_id,).toBe(worldId,);
    // Parent reference remapped to the imported Keep, not the source id.
    expect(cave?.parent_location_id,).toBe(keep?.id,);

    const quests = await db
      .selectFrom("quests",)
      .selectAll()
      .where("world_id", "=", worldId,)
      .execute();
    expect(quests,).toHaveLength(1,);

    const locationStates = await db
      .selectFrom("location_states",)
      .selectAll()
      .where("world_id", "=", worldId,)
      .execute();
    expect(locationStates[0]?.location_id,).toBe(keep?.id,);
    expect(locationStates[0]?.atmosphere,).toBe("candlelit",);

    const lore = await db
      .selectFrom("world_lore_entries",)
      .selectAll()
      .where("world_id", "=", worldId,)
      .execute();
    expect(lore[0]?.content,).toBe("The relic lies beneath the Keep.",);
  },);

  test("route imports a bundle and returns 201 with counts", async () => {
    const app = createApp(db,);
    const body = {
      schema_version: "1.0",
      world: { name: "Via Route", },
      locations: [],
    };
    const res = await app.handle(
      new Request("http://localhost/api/import/world", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify(body,),
      },),
    );

    expect(res.status,).toBe(201,);
    const parsed = (await res.json()) as { id: string; imported: Record<string, number> };
    expect(parsed.id,).toBeDefined();
    expect(parsed.imported.locations,).toBe(0,);
  },);

  test("route returns 400 when world is missing", async () => {
    const app = createApp(db,);
    const res = await app.handle(
      new Request("http://localhost/api/import/world", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ locations: [], }),
      },),
    );
    expect(res.status,).toBe(400,);
  },);
});
