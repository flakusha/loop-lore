import { Database, } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";
import { createLogger, } from "../logger";
import { createSqliteDialect, setTestDatabase, } from "./index";
import { assertMigrationsNotStale, compareMigrationNames, } from "./migrate";

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
 * Create an isolated in-memory Kysely for migration tests.
 *
 * FK enforcement comes from `createSqliteDialect` (it always runs
 * `PRAGMA foreign_keys = ON`) — we don't re-run it locally.
 * Also registers this DB as the active test override so any
 * `getDatabase()` call inside a migration callback resolves here,
 * not at the production DB (BUG-create-test-db-custom-dialect-can-bypass-settestdatabase).
 */
function createTestKysely(): { db: Database; kysely: Kysely<unknown> } {
  const db = new Database(":memory:",);
  const dialect = createSqliteDialect(db,);
  const kysely = new Kysely({ dialect, },);
  setTestDatabase(kysely as unknown as Kysely<import("./schema").DB>,);
  return { db, kysely, };
}

// ── Full migration chain test ────────────────────────────────

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

  test("all migrations revert in reverse order without error", async () => {
    for (const name of [...MIGRATION_NAMES,].reverse()) {
      if (migrations[name]!.down) {
        await migrations[name]!.down(kysely,);
      }
    }

    const names = schemaTables(db,);
    expect(names.size,).toBe(0,);
  });
});

// ── Per-migration roundtrip tests ────────────────────────────

/**
 * Only "no such table/column" failures count as the legitimate
 * ALTER-on-fresh-DB skip. Any other up() failure is a real bug and must
 * fail the suite instead of silently dropping this migration's
 * down()/idempotency coverage.
 * @param error
 */
function isExpectedFreshDbError(error: unknown,): boolean {
  return error instanceof Error && /no such (table|column)/.test(error.message,);
}

describe("per-migration roundtrip", () => {
  for (const name of MIGRATION_NAMES) {
    describe(name, () => {
      let db: Database;
      let kysely: Kysely<unknown>;
      let migration: Migration;
      let upSucceeded = false;

      beforeAll(async () => {
        // Load before registering the override — a failed import must not
        // leave a live test override behind
        // (BUG-settestdatabase-global-leak-on-test-throw).
        migration = await loadMigration(name,);
        ({ db, kysely, } = createTestKysely());
      },);

      afterAll(async () => {
        await kysely.destroy();
        db.close();
        setTestDatabase(null,);
      },);

      test("up() succeeds or fails only on missing base tables", async () => {
        try {
          await migration.up(kysely,);
          upSucceeded = true;
          const names = schemaTables(db,);
          expect(names.size,).toBeGreaterThan(0,);
        } catch (error) {
          // ALTER TABLE / FK migrations legitimately fail on a fresh DB
          // without base tables — anything else is a real bug.
          if (!isExpectedFreshDbError(error,)) { throw error; }
          upSucceeded = false;
        }
      });

      test("down() reverts cleanly (only if up succeeded)", async () => {
        if (!upSucceeded) { return; // Skip — up() failed, nothing to revert
         }
        if (migration.down) {
          await migration.down(kysely,);
        }
        const names = schemaTables(db,);
        expect(names.size,).toBe(0,);
      });

      test("up() idempotency (only if up succeeded)", async () => {
        if (!upSucceeded) { return; // Skip — up() failed
         }
        // Second up may throw for ALTER TABLE migrations — that's expected
        try {
          await migration.up(kysely,);
        } catch (error) {
          if (!isExpectedFreshDbError(error,)) { throw error; }
        }
        // DB should still have tables
        const names = schemaTables(db,);
        expect(names.size,).toBeGreaterThan(0,);
      });
    },);
  }
});

// ── Migration 001_init specific ──────────────────────────────

describe("001_init — core tables", () => {
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
    const { up, } = await import("./migrations/001_init");
    await up(kysely,);
    const names = schemaTables(db,);
    for (const table of ["users", "sessions", "telemetry_events", "system_config", "plugin_state",]) {
      expect(names.has(table,), `missing table: ${table}`,).toBe(true,);
    }
  });

  test("down() drops every table 001_init created", async () => {
    const { down, } = await import("./migrations/001_init");
    await down(kysely,);
    const names = schemaTables(db,);
    expect(names.size, `tables still present: ${[...names,].join(", ",)}`,).toBe(0,);
  });
});

// ── Flag inconsistencies ─────────────────────────────────────

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

  test("001_init down() reverts all sub-parts", async () => {
    const { db, kysely, } = createTestKysely();
    const { up, down, } = await import("./migrations/001_init");

    await up(kysely,);
    const tablesAfterUp = schemaTables(db,);
    expect(tablesAfterUp.size,).toBeGreaterThan(0,);

    await down(kysely,);
    const tablesAfterDown = schemaTables(db,);
    expect(tablesAfterDown.size,).toBe(0,);

    await kysely.destroy();
    db.close();
  });

  test("full chain up then full chain down leaves clean state", async () => {
    const { db, kysely, } = createTestKysely();
    const allMigrations = await loadAllMigrations();
    for (const name of MIGRATION_NAMES) {
      await allMigrations[name]!.up(kysely,);
    }
    const upCount = schemaTables(db,).size;

    for (const name of [...MIGRATION_NAMES,].reverse()) {
      if (allMigrations[name]!.down) {
        await allMigrations[name]!.down(kysely,);
      }
    }
    const downTables = schemaTables(db,);

    if (downTables.size > 0) {
      console.log("[migration-consistency] tables remaining after full down:", [...downTables,],);
    }
    expect(downTables.size,).toBe(0,);
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
