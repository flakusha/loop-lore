import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Database, } from "bun:sqlite";
import type { Kysely, } from "kysely";
import { createTestDb, } from "../test-utils/create-test-db";
import { createLogger, } from "../logger";
import {
  migrateCanonicalExtensions,
  runMigration,
} from "./migrate-character-legacy";
import type { DB, } from "../db/schema";

let sqlite: Database;
let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, sqlite, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

const seedUser = async (id: string, username: string,): Promise<void> => {
  await db
    .insertInto("users",)
    .values({
      id, username, display_name: username, role: "user", status: "active", settings: "{}",
    },)
    .execute();
};

const seedActor = async (
  id: string,
  userId: string,
  dataRaw: string | null,
): Promise<void> => {
  await db
    .insertInto("actors",)
    .values({
      id,
      actor_type: "character",
      display_name: id,
      user_id: null,
      owner_id: userId,
      agent_type: "none",
      settings: "{}",
      import_spec: "raw",
      data_source_format: "json",
      data_raw: dataRaw,
    },)
    .execute();
};

const readDataRaw = async (id: string,): Promise<string | null> => {
  const row = await db.selectFrom("actors").select("data_raw").where("id", "=", id).executeTakeFirst();
  return row?.data_raw ?? null;
};

describe("migrateCanonicalExtensions (pure)", () => {
  test("adds target_type='character' when target_character_id is present", () => {
    const result = migrateCanonicalExtensions({
      extensions: {
        relationships: [
          { target_character_id: "npc1", type: "friend", strength: 50, notes: "old friend" },
        ],
      },
    },);
    expect(result.changed).toBe(true);
    expect(result.fieldsAdded).toEqual(["relationships[].target_type"]);
    const rels = (result.next!.extensions as Record<string, unknown>).relationships as Record<string, unknown>[];
    expect(rels[0]?.target_type).toBe("character");
  },);

  test("preserves explicit target_type without overwriting", () => {
    const result = migrateCanonicalExtensions({
      extensions: {
        relationships: [
          { target_type: "faction", target_name: "Wardens", type: "ally", strength: 60 },
        ],
      },
    },);
    expect(result.changed).toBe(false);
    expect(result.fieldsAdded).toHaveLength(0);
  },);

  test("no-op when extensions is absent", () => {
    const result = migrateCanonicalExtensions({ name: "Plain", },);
    expect(result.changed).toBe(false);
    expect(result.next).toEqual({ name: "Plain", },);
  },);

  test("does not fabricate rarity/weight/value on inventory items", () => {
    const result = migrateCanonicalExtensions({
      extensions: {
        inventory: [
          { id: "sword", name: "Longsword", type: "weapon", description: "+", quantity: 1, equipped: true },
        ],
      },
    },);
    expect(result.changed).toBe(false);
    const inv = (result.next!.extensions as Record<string, unknown>).inventory as Record<string, unknown>[];
    expect(inv[0]).not.toHaveProperty("rarity");
    expect(inv[0]).not.toHaveProperty("weight");
    expect(inv[0]).not.toHaveProperty("value");
  },);
});

describe("runMigration (DB)", () => {
  test("migrates a V1 actor and is idempotent on re-run", async () => {
    await seedUser("u-mig-1", "migone");
    const legacyRaws = JSON.stringify({
      extensions: {
        inventory: [
          { id: "sword", name: "Longsword", type: "weapon", description: "+", quantity: 1, equipped: true },
        ],
        relationships: [
          { target_character_id: "npc1", type: "friend", strength: 50, notes: "old friend" },
          { target_character_id: "npc2", type: "rival", strength: 30 },
        ],
      },
    },);
    await seedActor("actor-mig-1", "u-mig-1", legacyRaws,);

    const firstRun = await runMigration(db);
    const migActor = firstRun.perActor.find((a,) => a.actorId === "actor-mig-1",);
    expect(migActor?.status).toBe("changed");
    expect(firstRun.changed).toBeGreaterThanOrEqual(1);
    expect(firstRun.fieldsAdded["relationships[].target_type"]).toBe(2);

    const afterFirst = await readDataRaw("actor-mig-1");
    expect(afterFirst).not.toBeNull();
    const parsed = JSON.parse(afterFirst!) as { extensions: { relationships: Array<Record<string, unknown>> } };
    expect(parsed.extensions.relationships[0]?.target_type).toBe("character");
    expect(parsed.extensions.relationships[1]?.target_type).toBe("character");

    // Re-run must be a no-op.
    const secondRun = await runMigration(db);
    const migActor2 = secondRun.perActor.find((a,) => a.actorId === "actor-mig-1",);
    expect(migActor2?.status).toBe("unchanged");
    expect(secondRun.changed).toBe(0);
  },);

  test("skips actors whose data_raw is null or empty", async () => {
    await seedUser("u-mig-2", "migtwo");
    await seedActor("actor-mig-empty", "u-mig-2", null,);
    await seedActor("actor-mig-blank", "u-mig-2", "   ",);

    const result = await runMigration(db);
    expect(result.perActor.find((a,) => a.actorId === "actor-mig-empty")?.status).toBe("skipped");
    expect(result.perActor.find((a,) => a.actorId === "actor-mig-blank")?.status).toBe("skipped");
  },);

  test("skips actors whose data_raw is not parseable JSON", async () => {
    await seedUser("u-mig-3", "migthree");
    await seedActor("actor-mig-yaml", "u-mig-3", "name: foo\ntype: character\n",);

    const result = await runMigration(db);
    expect(result.perActor.find((a,) => a.actorId === "actor-mig-yaml")?.status).toBe("skipped");
  },);

  test("preserves unrelated fields on the canonical payload", async () => {
    await seedUser("u-mig-4", "migfour");
    const payload = {
      name: "Aldric",
      description: "Veteran guard",
      extensions: {
        relationships: [
          { target_character_id: "old-friend", type: "friend", strength: 70 },
        ],
        custom_plugin_field: { plugin: "fantasy-rpg" },
      },
    };
    await seedActor("actor-mig-4", "u-mig-4", JSON.stringify(payload),);

    const result = await runMigration(db);
    expect(result.perActor.find((a,) => a.actorId === "actor-mig-4")?.status).toBe("changed");

    const after = await readDataRaw("actor-mig-4");
    const parsed = JSON.parse(after!) as Record<string, unknown>;
    expect(parsed.name).toBe("Aldric");
    expect(parsed.description).toBe("Veteran guard");
    const ext = parsed.extensions as Record<string, unknown>;
    expect(ext.custom_plugin_field).toEqual({ plugin: "fantasy-rpg", },);
  },);
});
