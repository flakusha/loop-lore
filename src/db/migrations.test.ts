import { Database, } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";
import { createLogger, } from "../logger";
import { createSqliteDialect, setTestDatabase, } from "./index";
import { assertMigrationsNotStale, compareMigrationNames, getMigrationFiles, } from "./migrate";

// ── Helpers ──────────────────────────────────────────────────

/**
 * @param db
 */
function schemaTables(db: Database,): Set<string> {
  const rows = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'kysely_%'",)
    .all() as { name: string }[];

  return new Set(rows.map((r,) => r.name),);
}

const MIGRATION_FILENAME = /^(\d{3})_(.+)\.ts$/;

const MIGRATIONS_DIR = path.join(__dirname, "migrations",);
const MIGRATION_NAMES = readdirSync(MIGRATIONS_DIR,)
  .filter((f,): f is string => MIGRATION_FILENAME.test(f,))
  .map((f,) => f.replace(/\.ts$/, "",))
  .toSorted(compareMigrationNames,);

/**
 * @param name
 */
async function loadMigration(name: string,): Promise<Migration> {
  const module = await import(path.join(MIGRATIONS_DIR, `${name}.ts`,));
  return module.default ?? module;
}

/** */
async function loadAllMigrations(): Promise<Record<string, Migration>> {
  const migrations: Record<string, Migration> = {};
  for (const name of MIGRATION_NAMES) {
    migrations[name] = await loadMigration(name,);
  }

  return migrations;
}

/**
 * Create an isolated in-memory Kysely for migration tests. FK enforcement
 * comes from `createSqliteDialect`, and the consolidated migrations no longer
 * resolve any database through a process-global override.
 */
function createTestKysely(): { db: Database; kysely: Kysely<unknown> } {
  const db = new Database(":memory:",);
  const dialect = createSqliteDialect(db,);
  const kysely = new Kysely({ dialect, },);
  return { db, kysely, };
}

// ── Full migration chain test ────────────────────────────────

/**
 * Only "no such table/column" failures count as an expected down() miss:
 * final-form files may drop a cross-domain table a sibling file owns. Any
 * other down() failure is a real bug.
 * @param error
 */
function isExpectedFreshDbError(error: unknown,): boolean {
  return error instanceof Error && /no such (table|column)/.test(error.message,);
}

describe("full migration chain", () => {
  let db: Database;
  let kysely: Kysely<unknown>;
  let migrations: Record<string, Migration>;

  beforeAll(async () => {
    // Load migrations before registering the override — a failed import must
    // not leave a live test override behind
    // (BUG-settestdatabase-global-leak-on-test-throw).
    migrations = await loadAllMigrations();
    ({ db, kysely, } = createTestKysely());
  },);

  afterAll(async () => {
    await kysely.destroy();
    db.close();
    setTestDatabase(null,);
  },);

  test("all migrations apply in order without error", async () => {
    for (const name of MIGRATION_NAMES) {
      await migrations[name]!.up(kysely,);
    }

    const names = schemaTables(db,);
    expect(names.has("users",),).toBe(true,);
    expect(names.has("chats",),).toBe(true,);
    expect(names.has("messages",),).toBe(true,);
    expect(names.has("actors",),).toBe(true,);
    expect(names.size,).toBeGreaterThan(10,);
  });

  test("worlds and locations have publication_status defaulting to draft", async () => {
    // Ensure the column exists with a 'draft' default (commit gating).
    const worldCols = db
      .query("PRAGMA table_info(worlds)",)
      .all() as { name: string; dflt_value: string | null }[];

    const worldPub = worldCols.find((c,) => c.name === "publication_status");
    expect(worldPub,).toBeDefined();
    expect(worldPub!.dflt_value,).toContain("draft",);

    const locCols = db
      .query("PRAGMA table_info(locations)",)
      .all() as { name: string; dflt_value: string | null }[];

    const locPub = locCols.find((c,) => c.name === "publication_status");
    expect(locPub,).toBeDefined();
    expect(locPub!.dflt_value,).toContain("draft",);
  });

  test("rollback drops the bulk of the consolidated schema", async () => {
    const before = schemaTables(db,).size;
    for (const name of [...MIGRATION_NAMES,].reverse()) {
      if (!migrations[name]!.down) { continue; }
      try {
        await migrations[name]!.down(kysely,);
      } catch (error) {
        // Final-form down() files also drop cross-domain tables that a
        // sibling file owns; a missing table is expected. Any other failure
        // is a real bug.
        if (!isExpectedFreshDbError(error,)) { throw error; }
      }
    }

    const names = schemaTables(db,);
    expect(names.size, "rollback must remove tables",).toBeLessThan(before,);
    expect(names.has("users",),).toBe(false,);
    expect(names.has("sessions",),).toBe(false,);
  });
});

// ── Per-migration application ────────────────────────────────

/**
 * Final-form files create their whole domain inline, so a standalone up()
 * (on an empty DB) and a zero-table down() are no longer meaningful. Each
 * file is applied on top of its ancestors instead. down() may report a
 * cross-domain table that is not present, but no other failure is acceptable.
 */
describe("per-migration application", () => {
  for (const name of MIGRATION_NAMES) {
    describe(name, () => {
      let db: Database;
      let kysely: Kysely<unknown>;
      let migration: Migration;

      beforeAll(async () => {
        migration = await loadMigration(name,);
        ({ db, kysely, } = createTestKysely());
        const all = await loadAllMigrations();
        for (const ancestor of MIGRATION_NAMES.slice(0, MIGRATION_NAMES.indexOf(name,),)) {
          await all[ancestor]!.up(kysely,);
        }
      },);

      afterAll(async () => {
        await kysely.destroy();
        db.close();
      },);

      test("up() applies cleanly on top of its ancestors", async () => {
        await migration.up(kysely,);
        expect(schemaTables(db,).size,).toBeGreaterThan(0,);
      });

      test("down() only fails on absent cross-domain tables", async () => {
        if (!migration.down) { return; }
        try {
          await migration.down(kysely,);
        } catch (error) {
          if (!isExpectedFreshDbError(error,)) { throw error; }
        }
      });
    },);
  }
});

// ── Migration 001_core specific ──────────────────────────────

describe("001_core — core tables", () => {
  let db: Database;
  let kysely: Kysely<unknown>;

  beforeAll(async () => {
    ({ db, kysely, } = createTestKysely());
  },);

  afterAll(async () => {
    await kysely.destroy();
    db.close();
    setTestDatabase(null,);
  },);

  test("up() creates the core identity tables", async () => {
    const { up, } = await import("./migrations/001_core");
    await up(kysely,);
    const names = schemaTables(db,);
    // plugin_state moved to 014_support_singletons in the consolidated baseline.
    for (const table of ["users", "sessions", "telemetry_events", "system_config",]) {
      expect(names.has(table,), `missing table: ${table}`,).toBe(true,);
    }
  });

  test("down() drops every table 001_core created", async () => {
    const { down, } = await import("./migrations/001_core");
    await down(kysely,);
    const names = schemaTables(db,);
    expect(names.size, `tables still present: ${[...names,].join(", ",)}`,).toBe(0,);
  });
});

// ── Flag inconsistencies ─────────────────────────────────────

describe("migration numbering is sequential from 001", () => {
  test("numeric prefixes are unique and gapless", () => {
    const prefixes = MIGRATION_NAMES.map((name,) => Number(name.slice(0, 3,),));

    // Two migrations sharing a prefix is not a load failure — getMigrationFiles()
    // keys by full filename — but compareMigrationNames then falls back to the
    // name, so the applied order silently diverges from the authored one. Pin
    // it: a duplicate prefix means someone picked a number dev already shipped.
    const dupes = prefixes.filter((n,) => prefixes.indexOf(n,) !== prefixes.lastIndexOf(n,));
    expect(dupes, `duplicate migration prefix(es): ${dupes.join(", ",)}`,).toEqual([],);

    expect(prefixes[0],).toBe(1,);

    // The consolidated baseline plus honeypot and mesh intel appends: 001..016.
    const expected = Array.from({ length: 16, }, (_, i,) => i + 1,);
    expect(MIGRATION_NAMES,).toHaveLength(16,);
    expect(prefixes, "prefixes must be 001..016 with no gaps",).toEqual(expected,);

    // No parked numbers: every slot in the baseline is shipped.
    const parked = expected.filter((n,) => !prefixes.includes(n,));
    expect(parked, "parked migration numbers",).toEqual([],);
  });
});

describe("migration consistency flags", () => {
  let migrations: Record<string, Migration>;

  // The last two tests set the override in-body; clear it even when a test
  // throws mid-way (BUG-settestdatabase-global-leak-on-test-throw).
  afterEach(() => {
    setTestDatabase(null,);
  },);

  beforeAll(async () => {
    migrations = await loadAllMigrations();
  },);

  test("every migration has up()", () => {
    for (const name of MIGRATION_NAMES) {
      expect(typeof migrations[name]!.up, `${name} must have up()`,).toBe("function",);
    }
  });

  test("flag migrations missing down() for future improvement", () => {
    const missingDown: string[] = [];
    for (const name of MIGRATION_NAMES) {
      if (typeof migrations[name]!.down !== "function") {
        missingDown.push(name,);
      }
    }

    if (missingDown.length > 0) {
      console.log("[migration-consistency] missing down():", missingDown,);
    }
  });

  test("no migration adds an index that duplicates an existing one", async () => {
    const redundant = async (names: string[],): Promise<Set<string>> => {
      const { db, kysely, } = createTestKysely();
      const allMigrations = await loadAllMigrations();
      for (const name of names) {
        await allMigrations[name]!.up(kysely,);
      }

      const seen = new Set<string>();
      const duplicates = new Set<string>();
      for (const table of schemaTables(db,)) {
        const indexes = db
          .query("SELECT name, partial FROM pragma_index_list(?)",)
          .all(table,) as { name: string; partial: number }[];

        for (const index of indexes) {
          if (index.name.startsWith("sqlite_autoindex_",)) { continue; }
          const columns = (db
            .query("SELECT name FROM pragma_index_info(?)",)
            .all(index.name,) as { name: string }[])
            .map((c,) => c.name)
            .join(",",);

          // A partial index serves a strict subset of its columns' queries, so
          // it never counts as a redundant twin of a full one.
          const signature = `${table}${index.partial ? " PARTIAL" : ""}(${columns},)`;
          if (seen.has(signature,)) { duplicates.add(signature,); }
          else { seen.add(signature,); }
        }
      }

      await kysely.destroy();
      db.close();
      return duplicates;
    };

    // The consolidated baseline is final-form: assert the shipped schema has
    // no duplicate (table, partiality, columns) signatures.
    const duplicates = await redundant(MIGRATION_NAMES,);
    // One pre-existing pair (created_at on telemetry_events) is baseline debt.
    expect([...duplicates,],).toEqual(["telemetry_events(created_at,)",],);
  });

  test("001_core down() reverts all sub-parts", async () => {
    const { db, kysely, } = createTestKysely();
    const { up, down, } = await import("./migrations/001_core");

    await up(kysely,);
    const tablesAfterUp = schemaTables(db,);
    expect(tablesAfterUp.size,).toBeGreaterThan(0,);

    await down(kysely,);
    const tablesAfterDown = schemaTables(db,);
    expect(tablesAfterDown.size,).toBe(0,);

    await kysely.destroy();
    db.close();
  });

  test("full chain up then rollback removes most tables", async () => {
    const { db, kysely, } = createTestKysely();
    const allMigrations = await loadAllMigrations();
    for (const name of MIGRATION_NAMES) {
      await allMigrations[name]!.up(kysely,);
    }

    const upCount = schemaTables(db,).size;

    for (const name of [...MIGRATION_NAMES,].reverse()) {
      if (!allMigrations[name]!.down) { continue; }
      try {
        await allMigrations[name]!.down(kysely,);
      } catch (error) {
        if (!isExpectedFreshDbError(error,)) { throw error; }
      }
    }

    const downTables = schemaTables(db,);
    // Final-form down() files leave cross-domain tables behind; the oracle is
    // that rollback makes real progress rather than restoring an empty DB.
    expect(downTables.size,).toBeLessThan(upCount,);
    expect(upCount,).toBeGreaterThan(10,);

    await kysely.destroy();
    db.close();
  });
});

// ── activitypub_actor_keys FK cascade (BUG-migration-activitypub-actor-keys-fk-missing-ondelete-cascade) ─

describe("activitypub_actor_keys FK cascades on actor delete", () => {
  test("deleting an actor removes its activitypub_actor_keys rows", async () => {
    const { db, kysely, } = createTestKysely();
    try {
      const migrations = await loadAllMigrations();
      for (const name of MIGRATION_NAMES) {
        await migrations[name]!.up(kysely,);
      }

      // createTestKysely() enables PRAGMA foreign_keys = ON. Insert a
      // user → actor → activitypub_actor_key chain so we can delete the
      // actor and confirm the key row goes with it.
      const userId = "u-" + crypto.randomUUID();
      const worldId = "w-" + crypto.randomUUID();
      const actorId = "a-" + crypto.randomUUID();
      const keyId = "k-" + crypto.randomUUID();
      await sql`INSERT INTO users (id, username, display_name, created_at) VALUES (${userId}, ${userId}, ${userId}, datetime('now'))`
        .execute(
          kysely,
        );

      await sql`INSERT INTO worlds (id, owner_id, name, created_at) VALUES (${worldId}, ${userId}, ${worldId}, datetime('now'))`
        .execute(
          kysely,
        );

      await sql`INSERT INTO actors (id, user_id, display_name, created_at) VALUES (${actorId}, ${userId}, ${actorId}, datetime('now'))`
        .execute(
          kysely,
        );

      await sql`INSERT INTO activitypub_actor_keys (id, actor_id, key_id, public_jwk, encrypted_private_jwk, created_at) VALUES (${keyId}, ${actorId}, ${
        "key:" + keyId
      }, ${"{}"}, ${"{}"}, datetime('now'))`.execute(
        kysely,
      );

      const before = await sql<
        { c: number }
      >`SELECT COUNT(*) AS c FROM activitypub_actor_keys WHERE actor_id = ${actorId}`.execute(
        kysely,
      );

      expect(Number(before.rows[0]?.c ?? 0,),).toBe(1,);
      // Delete the actor. With onDelete: cascade, the key row is removed
      // automatically. Pre-fix this throws FOREIGN KEY constraint failed.
      await sql`DELETE FROM actors WHERE id = ${actorId}`.execute(kysely,);
      const after = await sql<
        { c: number }
      >`SELECT COUNT(*) AS c FROM activitypub_actor_keys WHERE actor_id = ${actorId}`.execute(
        kysely,
      );

      expect(Number(after.rows[0]?.c ?? 0,),).toBe(0,);
    } finally {
      await kysely.destroy();
      db.close();
      setTestDatabase(null,);
    }
  });
});

// ── Migration staleness guard ───────────────────────────────

describe("migration staleness guard", () => {
  let db: Database;
  let kysely: Kysely<unknown>;
  let migrations: Record<string, Migration>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    // Load before registering the override — a failed import must not leave
    // a live test override behind
    // (BUG-settestdatabase-global-leak-on-test-throw).
    migrations = await loadAllMigrations();
    ({ db, kysely, } = createTestKysely());
    const migrator = new Migrator({
      db: kysely,
      provider: { getMigrations: async () => migrations, },
    },);

    const { error, } = await migrator.migrateToLatest();
    expect(error,).toBeUndefined();
  },);

  afterAll(async () => {
    await kysely.destroy();
    db.close();
    setTestDatabase(null,);
  },);

  test("passes when every applied migration still exists", async () => {
    await expect(assertMigrationsNotStale(kysely, migrations,),).resolves.toBeUndefined();
  });

  test("throws when a shipped migration is missing from the provider", async () => {
    const first = MIGRATION_NAMES[0]!;
    const { [first]: _dropped, ...filtered } = migrations;
    await expect(assertMigrationsNotStale(kysely, filtered,),).rejects.toThrow(
      /no longer exist|append-only|Recovery/,
    );
  });

  test("error message names the missing migration", async () => {
    const first = MIGRATION_NAMES[0]!;
    const { [first]: _dropped, ...filtered } = migrations;
    await expect(assertMigrationsNotStale(kysely, filtered,),).rejects.toThrow(first,);
  });

  test("passes on a fresh database without a kysely_migration table", async () => {
    const { db: freshDb, kysely: fresh, } = createTestKysely();
    try {
      await expect(assertMigrationsNotStale(fresh, migrations,),).resolves.toBeUndefined();
    } finally {
      // Cleanup must run even when the assertion throws — otherwise the
      // override leaks into sibling files
      // (BUG-settestdatabase-global-leak-on-test-throw).
      await fresh.destroy();
      freshDb.close();
      setTestDatabase(null,);
    }
  });
});

// ── Loader filter (BUG-migrate-ts-loader-imports-test-ts-files) ─

describe("migration loader excludes colocated *.test.ts", () => {
  test("getMigrationFiles does not register *.test.ts as migrations", async () => {
    const { getMigrationFiles, } = await import("./migrate");
    const migrations = await getMigrationFiles();
    const names = Object.keys(migrations,);
    expect(names.length,).toBeGreaterThan(0,);
    for (const name of names) {
      expect(name,).not.toMatch(/\.test$/,);
    }
  });

  test("readdirSync of migrations dir contains no *.test.ts files", () => {
    // Defensive: if a future migration colocates a *.test.ts, the loader
    // filter above is the load-bearing safety net. This assertion fails
    // fast if someone bypasses the filter by accident (e.g. by adding a
    // colocated test that the loader must skip).
    const files = readdirSync(MIGRATIONS_DIR,);
    const strayTests = files.filter((f,) => f.endsWith(".test.ts",));
    expect(strayTests,).toEqual([],);
  });
});

// ── legacy chat classification — final schema ────────────────

/**
 * Classification oracle from the retired 091 backfill. In the 14-file
 * baseline `chats` ships in its final shape and the backfill DML lives in
 * 005_chat.ts, applied at install time. These tests replay that same predicate
 * over legacy-shaped rows on a fresh final-schema DB, so every mapping rule
 * stays covered without a mid-chain fixture.
 *
 * RESOURCE CONTRACT: one :memory: DB per test, no process globals; the raw
 * handle and Kysely are closed in afterEach even if an assertion throws.
 */
describe("chat purpose classification (final schema)", () => {
  interface LegacyFixture {
    name: string;
    type: string;
    mode: string;
    worldId?: string;
    gmConfig?: string;
    /** Purpose present before the backfill (taxonomy-era creates). */
    purpose?: string;
    /** Purpose the backfill must produce; null = stays unclassified. */
    expected: string | null;
  }

  // One row per ticket mapping-rule bucket plus every must-stay-NULL shape.
  const FIXTURES: readonly LegacyFixture[] = [
    // — unclassified (ambiguous): variants 1/3/9 and 2/4/5/8/10 are
    //   indistinguishable on the observed columns —
    { name: "legacy plain direct", type: "direct", mode: "direct", expected: null, },
    { name: "legacy group social", type: "group", mode: "group", expected: null, },
    // VN is a rendering concern (gm_config), not a taxonomy dimension.
    {
      name: "legacy vn flagged",
      type: "direct",
      mode: "direct",
      gmConfig: '{"renderingOverride":"visual_novel"}',
      expected: null,
    },
    // GM-role chat could be variant 8 (guided) or 11 (rpg) — ambiguous.
    {
      name: "legacy gm role",
      type: "direct",
      mode: "story",
      gmConfig: '{"assistantRole":"gm"}',
      expected: null,
    },
    // Corrupted gm_config must not throw (json_valid guard) and stays NULL.
    {
      name: "legacy corrupted gm_config",
      type: "direct",
      mode: "direct",
      gmConfig: "{not json",
      expected: null,
    },
    // — R2: battle without a world = LLM↔LLM validation harness —
    { name: "legacy battle direct", type: "direct", mode: "battle", expected: "validation", },
    { name: "legacy battle group", type: "group", mode: "battle", expected: "validation", },
    // — R3: gm_config validation block without battle mode —
    {
      name: "legacy harness gm_config",
      type: "direct",
      mode: "direct",
      gmConfig: '{"validation":{"harness":"smoke"}}',
      expected: "validation",
    },
    // — R1: world-bound chats are RPG chats (any type/mode) —
    { name: "legacy rpg direct", type: "direct", mode: "direct", worldId: "backfill-world", expected: "rpg", },
    { name: "legacy rpg group", type: "group", mode: "group", worldId: "backfill-world", expected: "rpg", },
    // R1 outranks R2: a world-bound battle chat is an RPG party chat.
    { name: "legacy rpg battle group", type: "group", mode: "battle", worldId: "backfill-world", expected: "rpg", },
    // — taxonomy-era rows the create route already purposed —
    { name: "variant roleplay chat", type: "direct", mode: "story", purpose: "roleplay", expected: "roleplay", },
    {
      name: "variant rpg world chat",
      type: "direct",
      mode: "story",
      purpose: "rpg",
      worldId: "backfill-world",
      expected: "rpg",
    },
  ];

  let raw: Database;
  let db: Kysely<unknown>;

  /** The backfill DML shipped in 005_chat.ts, replayed over seeded rows. */
  async function applyBackfill(): Promise<void> {
    await sql`UPDATE chats
       SET purpose = CASE
         WHEN world_id IS NOT NULL THEN 'rpg'
         WHEN world_id IS NULL AND mode = 'battle' THEN 'validation'
         WHEN world_id IS NULL AND mode <> 'battle' AND gm_config IS NOT NULL
           AND json_valid(gm_config)
           AND json_extract(gm_config, '$.validation') IS NOT NULL THEN 'validation'
         ELSE purpose
       END
       WHERE purpose IS NULL AND (
         world_id IS NOT NULL OR mode = 'battle' OR (
           mode <> 'battle' AND gm_config IS NOT NULL AND json_valid(gm_config)
           AND json_extract(gm_config, '$.validation') IS NOT NULL
         )
       )`.execute(db,);
  }

  async function chatsByName(): Promise<Record<string, { purpose: string | null; type: string; mode: string }>> {
    const { rows, } = await sql<{
      name: string;
      purpose: string | null;
      type: string;
      mode: string;
    }>`SELECT name, purpose, type, mode FROM chats`.execute(db,);

    return Object.fromEntries(rows.map((r,) => [r.name, r,]),);
  }

  beforeEach(async () => {
    raw = new Database(":memory:",);
    db = new Kysely({ dialect: createSqliteDialect(raw,), },);
    for (const migration of Object.values(await getMigrationFiles(),)) {
      await migration.up(db,);
    }

    raw.run(
      "INSERT INTO users (id, username, display_name) VALUES ('backfill-user', 'backfill-user', 'Backfill User')",
    );

    raw.run(
      "INSERT INTO worlds (id, owner_id, name) VALUES ('backfill-world', 'backfill-user', 'Backfill World')",
    );

    for (const [i, fixture,] of FIXTURES.entries()) {
      await sql`INSERT INTO chats (id, name, type, mode, created_by, world_id, gm_config, purpose)
        VALUES (${`backfill-chat-${i}`}, ${fixture.name}, ${fixture.type}, ${fixture.mode},
                'backfill-user', ${fixture.worldId ?? null}, ${fixture.gmConfig ?? null},
                ${fixture.purpose ?? null})`.execute(db,);
    }
  },);

  afterEach(async () => {
    await db.destroy();
    raw.close();
  },);

  test("classifies legacy shapes per the ticket mapping table", async () => {
    await applyBackfill();
    const chats = await chatsByName();
    for (const fixture of FIXTURES) {
      expect(
        chats[fixture.name]?.purpose,
        `purpose for "${fixture.name}" (${fixture.type}/${fixture.mode})`,
      ).toBe(fixture.expected,);
    }

    // Pure data migration: type/mode must be untouched on every row.
    for (const fixture of FIXTURES) {
      expect(chats[fixture.name]?.type, `type for "${fixture.name}"`,).toBe(fixture.type,);
      expect(chats[fixture.name]?.mode, `mode for "${fixture.name}"`,).toBe(fixture.mode,);
    }
  }, 120000,);

  test("replaying the backfill is idempotent", async () => {
    await applyBackfill();
    const first = await chatsByName();
    await applyBackfill();
    const second = await chatsByName();
    expect(second,).toEqual(first,);
  }, 120000,);
});
