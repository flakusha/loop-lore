import { Database, } from "bun:sqlite";
import type { Database as DatabaseType, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, mock, test, } from "bun:test";
import { Kysely, } from "kysely";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { createSqliteDialect, } from "../db/index";
import { runMigrations, } from "../db/migrate";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { ISOLATED, } from "../test-utils/isolate-only";
import {
  main,
  migrateCanonicalExtensions,
  runMigration,
} from "./migrate-character-legacy";

const describeIsolated = ISOLATED ? describe : describe.skip;

let sqlite: DatabaseType;
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
      id,
      username,
      display_name: username,
      role: "user",
      status: "active",
      settings: "{}",
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
  const row = await db.selectFrom("actors",).select("data_raw",).where("id", "=", id,).executeTakeFirst();
  return row?.data_raw ?? null;
};

describe("migrateCanonicalExtensions (pure)", () => {
  test("adds target_type='character' when target_character_id is present", () => {
    const result = migrateCanonicalExtensions({
      extensions: {
        relationships: [
          { target_character_id: "npc1", type: "friend", strength: 50, notes: "old friend", },
        ],
      },
    },);
    expect(result.changed,).toBe(true,);
    expect(result.fieldsAdded,).toEqual(["relationships[].target_type",],);
    const rels = (result.next!.extensions as Record<string, unknown>).relationships as Record<string, unknown>[];
    expect(rels[0]?.target_type,).toBe("character",);
  });

  test("preserves explicit target_type without overwriting", () => {
    const result = migrateCanonicalExtensions({
      extensions: {
        relationships: [
          { target_type: "faction", target_name: "Wardens", type: "ally", strength: 60, },
        ],
      },
    },);
    expect(result.changed,).toBe(false,);
    expect(result.fieldsAdded,).toHaveLength(0,);
  });

  test("no-op when extensions is absent", () => {
    const result = migrateCanonicalExtensions({ name: "Plain", },);
    expect(result.changed,).toBe(false,);
    expect(result.next,).toEqual({ name: "Plain", },);
  });

  test("does not fabricate rarity/weight/value on inventory items", () => {
    const result = migrateCanonicalExtensions({
      extensions: {
        inventory: [
          { id: "sword", name: "Longsword", type: "weapon", description: "+", quantity: 1, equipped: true, },
        ],
      },
    },);
    expect(result.changed,).toBe(false,);
    const inv = (result.next!.extensions as Record<string, unknown>).inventory as Record<string, unknown>[];
    expect(inv[0],).not.toHaveProperty("rarity",);
    expect(inv[0],).not.toHaveProperty("weight",);
    expect(inv[0],).not.toHaveProperty("value",);
  });
});

describe("runMigration (DB)", () => {
  test("migrates a V1 actor and is idempotent on re-run", async () => {
    await seedUser("u-mig-1", "migone",);
    const legacyRaws = JSON.stringify({
      extensions: {
        inventory: [
          { id: "sword", name: "Longsword", type: "weapon", description: "+", quantity: 1, equipped: true, },
        ],
        relationships: [
          { target_character_id: "npc1", type: "friend", strength: 50, notes: "old friend", },
          { target_character_id: "npc2", type: "rival", strength: 30, },
        ],
      },
    },);
    await seedActor("actor-mig-1", "u-mig-1", legacyRaws,);

    const firstRun = await runMigration(db,);
    const migActor = firstRun.perActor.find((a,) => a.actorId === "actor-mig-1");
    expect(migActor?.status,).toBe("changed",);
    expect(firstRun.changed,).toBeGreaterThanOrEqual(1,);
    expect(firstRun.fieldsAdded["relationships[].target_type"],).toBe(2,);

    const afterFirst = await readDataRaw("actor-mig-1",);
    expect(afterFirst,).not.toBeNull();
    const parsed = JSON.parse(afterFirst!,) as { extensions: { relationships: Array<Record<string, unknown>> } };
    expect(parsed.extensions.relationships[0]?.target_type,).toBe("character",);
    expect(parsed.extensions.relationships[1]?.target_type,).toBe("character",);

    // Re-run must be a no-op.
    const secondRun = await runMigration(db,);
    const migActor2 = secondRun.perActor.find((a,) => a.actorId === "actor-mig-1");
    expect(migActor2?.status,).toBe("unchanged",);
    expect(secondRun.changed,).toBe(0,);
  });

  test("skips actors whose data_raw is null or empty", async () => {
    await seedUser("u-mig-2", "migtwo",);
    await seedActor("actor-mig-empty", "u-mig-2", null,);
    await seedActor("actor-mig-blank", "u-mig-2", "   ",);

    const result = await runMigration(db,);
    expect(result.perActor.find((a,) => a.actorId === "actor-mig-empty")?.status,).toBe("skipped",);
    expect(result.perActor.find((a,) => a.actorId === "actor-mig-blank")?.status,).toBe("skipped",);
  });

  test("skips actors whose data_raw is not parseable JSON", async () => {
    await seedUser("u-mig-3", "migthree",);
    await seedActor("actor-mig-yaml", "u-mig-3", "name: foo\ntype: character\n",);

    const result = await runMigration(db,);
    expect(result.perActor.find((a,) => a.actorId === "actor-mig-yaml")?.status,).toBe("skipped",);
  });

  test("preserves unrelated fields on the canonical payload", async () => {
    await seedUser("u-mig-4", "migfour",);
    const payload = {
      name: "Aldric",
      description: "Veteran guard",
      extensions: {
        relationships: [
          { target_character_id: "old-friend", type: "friend", strength: 70, },
        ],
        custom_plugin_field: { plugin: "fantasy-rpg", },
      },
    };
    await seedActor("actor-mig-4", "u-mig-4", JSON.stringify(payload,),);

    const result = await runMigration(db,);
    expect(result.perActor.find((a,) => a.actorId === "actor-mig-4")?.status,).toBe("changed",);

    const after = await readDataRaw("actor-mig-4",);
    const parsed = JSON.parse(after!,) as Record<string, unknown>;
    expect(parsed.name,).toBe("Aldric",);
    expect(parsed.description,).toBe("Veteran guard",);
    const ext = parsed.extensions as Record<string, unknown>;
    expect(ext.custom_plugin_field,).toEqual({ plugin: "fantasy-rpg", },);
  });

  test("skips actors whose data_raw is a JSON array, not object", async () => {
    await seedUser("u-mig-arr", "migarr",);
    await seedActor("actor-mig-arr", "u-mig-arr", JSON.stringify([1, 2, 3,],),);

    const result = await runMigration(db,);
    expect(result.perActor.find((a,) => a.actorId === "actor-mig-arr")?.status,).toBe("skipped",);
    expect(result.perActor.find((a,) => a.actorId === "actor-mig-arr")?.reason,).toContain("not a JSON object",);
  });
});

describeIsolated("main() CLI entry", () => {
  let tmpDir: string;
  let realConfigLoad: Record<string, unknown>;

  beforeAll(async () => {
    const mod = await import("../config/load");
    realConfigLoad = mod as unknown as Record<string, unknown>;
  },);

  afterAll(() => {
    mock.module("../config/load", () => realConfigLoad,);
  },);

  test("rejects :memory: SQLite filename and returns 1", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "loop-lore-main-",),);
    try {
      mock.module("../config/load", () => ({
        ...realConfigLoad,
        loadConfig: () => ({ db: { type: "sqlite", sqliteFilename: ":memory:", }, }),
      }),);
      const code = await main();
      expect(code,).toBe(1,);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true, },);
    }
  });

  test("happy path: prints summary and returns 0 against a real on-disk DB", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "loop-lore-main-",),);
    const dbPath = join(tmpDir, "loop-lore.db",);
    const seedSqlite = new Database(dbPath,);
    seedSqlite.run("PRAGMA foreign_keys = ON",);
    const seedDb = new Kysely<DB>({ dialect: createSqliteDialect(seedSqlite,), },);
    await runMigrations(seedDb,);
    await seedDb
      .insertInto("users",)
      .values({
        id: "u-cli",
        username: "cli",
        display_name: "CLI User",
        password_hash: "x",
        role: "user",
        settings: "{}",
      },)
      .execute();
    await seedDb
      .insertInto("actors",)
      .values({
        id: "actor-cli-1",
        user_id: "u-cli",
        display_name: "CLI Actor",
        data_raw: JSON.stringify({
          extensions: {
            relationships: [
              { target_character_id: "npc1", type: "friend", strength: 50, },
            ],
          },
        },),
      },)
      .execute();
    await seedDb.destroy();
    seedSqlite.close();

    try {
      mock.module("../config/load", () => ({
        ...realConfigLoad,
        loadConfig: () => ({ db: { type: "sqlite", sqliteFilename: dbPath, }, }),
      }),);
      const origLog = console.log;
      const origErr = console.error;
      console.log = () => {};
      console.error = () => {};
      let code = -1;
      try {
        code = await main();
      } finally {
        console.log = origLog;
        console.error = origErr;
      }
      expect(code,).toBe(0,);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true, },);
    }
  });

  test("CLI guard: bun run script exits 0 against a real on-disk DB", async () => {
    const cliTmp = mkdtempSync(join(tmpdir(), "loop-lore-cli-",),);
    const configDir = mkdtempSync(join(tmpdir(), "loop-lore-cli-cfg-",),);
    const dbPath = join(cliTmp, "loop-lore.db",);
    const scriptPath = join(import.meta.dir, "migrate-character-legacy.ts",);

    const seedSqlite = new Database(dbPath,);
    seedSqlite.run("PRAGMA foreign_keys = ON",);
    const seedDb = new Kysely<DB>({ dialect: createSqliteDialect(seedSqlite,), },);
    await runMigrations(seedDb,);
    await seedDb.destroy();
    seedSqlite.close();

    writeFileSync(join(configDir, "config.toml",), `[db]\nsqliteFilename = "${dbPath}"\n`,);

    try {
      const proc = Bun.spawn({
        cmd: ["bun", "run", scriptPath,],
        cwd: configDir,
        env: { ...process.env, },
        stdout: "pipe",
        stderr: "pipe",
      },);
      const exitCode = await proc.exited;
      const stderr = await new Response(proc.stderr,).text();
      const stdout = await new Response(proc.stdout,).text();
      if (exitCode !== 0) {
        console.error("=== CLI guard failure ===",);
        console.error("stdout:", stdout,);
        console.error("stderr:", stderr,);
      }
      expect(exitCode,).toBe(0,);
      expect(stdout,).toContain("migrate:character:legacy summary",);
    } finally {
      rmSync(cliTmp, { recursive: true, force: true, },);
      rmSync(configDir, { recursive: true, force: true, },);
    }
  });
},);
