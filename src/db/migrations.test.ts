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

    // 058 is parked on the unmerged `world-conditions-time` branch
    // (src/db/migrations/058_world_conditions.ts), so dev legitimately has a
    // hole at 58 until that branch finalizes. 066 (instance storage budgets)
    // is parked the same way: it belongs to the still-unmerged
    // `feat-fed-storage-quota` branch of the federation-offload epic, and 068
    // (performance quota budgets) is numbered past it so no two branches
    // collide. 065 (peer workload columns) and 067 (workload assignments) have
    // landed, so they are no longer holes. 071 and 072 are parked on parallel
    // unmerged branches (`char-stat-traits`, `chat-rich-engagement`,
    // `xp-progression-surface`); the message-translations migrations were
    // renumbered to 073/074 to avoid colliding with those claims. 081 is
    // parked on an unmerged sibling branch (observed there as `081_*`
    // during the immersion-gate work); 082 onwards were numbered past it
    // so no two branches collide. 084 is parked on the unmerged
    // `feat-lore-knowledge` branch (`084_lore_reveal_condition_timeline_rarity`,
    // authored first); the memory-propagation branch took 085 to avoid the
    // collision. Only numbers
    // listed here may be absent; any other gap still fails below.
    const PARKED = [58, 66, 71, 72, 81, 84,];
    const parkedMissing = PARKED.filter((n,) => !prefixes.includes(n,));
    const expected = Array.from(
      { length: prefixes.length + parkedMissing.length, },
      (_, i,) => i + 1,
    ).filter((n,) => !parkedMissing.includes(n,));

    expect(prefixes, `prefixes must be 001..N with no gaps (parked: ${parkedMissing.join(", ",)})`,).toEqual(expected,);
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

    // Baseline is every migration before the hot-path sweep. Pairs that
    // already existed — including partial unique indexes the column list
    // cannot distinguish — are pre-existing debt, not this sweep's doing.
    const sweepStart = MIGRATION_NAMES.indexOf("035_hot_path_indexes",);
    const before = await redundant(MIGRATION_NAMES.slice(0, sweepStart,),);
    const after = await redundant(MIGRATION_NAMES,);

    expect([...after,].filter((s,) => !before.has(s,)),).toEqual([],);
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

// ── 084_chat_variant_backfill — legacy chat classification ───

/**
 * Fixture-backed classification tests for the legacy-chat taxonomy backfill
 * (spec: .plan/tickets/TASK-chat-variant-legacy-backfill.md).
 *
 * Mirrors migration-rename-upgrade.test.ts: a fresh in-memory DB migrates to
 * the pre-backfill tail (083), legacy-shaped chats are seeded, and the REAL
 * Migrator then applies (and later rolls back / re-applies) 084 — through
 * migrateTo()/migrateToLatest()/migrateDown(), so transactional behavior
 * matches a real upgrade rather than a direct up()/down() call.
 */
describe("084_chat_variant_backfill — legacy chat classification", () => {
  /** Last migration before the backfill. */
  const BEFORE_BACKFILL = "083_immersion_decision_log";

  interface LegacyFixture {
    name: string;
    type: string;
    mode: string;
    worldId?: string;
    gmConfig?: string;
    /** Purpose present BEFORE the backfill (taxonomy-era creates). */
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

  /** Provider over the same directory scan MIGRATION_NAMES reflects. */
  function backfillProvider() {
    return {
      async getMigrations(): Promise<Record<string, Migration>> {
        const migrations: Record<string, Migration> = {};
        for (const name of MIGRATION_NAMES) {
          migrations[name] = await loadMigration(name,);
        }

        return migrations;
      },
    };
  }

  /**
   * Migrate to the pre-backfill tail, seed one user + world + the fixture
   * chats, and hand back the DB before 084 has run.
   */
  async function seededLegacyDb() {
    const sqlite = new Database(":memory:",);
    // Kysely<any>, as in migration-rename-upgrade.test.ts: legacy fixtures are
    // deliberately written as raw shape rows, not typed inserts.
    const db = new Kysely<any>({ dialect: createSqliteDialect(sqlite,), },);
    setTestDatabase(db as unknown as Kysely<import("./schema").DB>,);
    const migrator = new Migrator({ db, provider: backfillProvider(), },);

    const before = await migrator.migrateTo(BEFORE_BACKFILL,);
    expect(before.error, "migrating to the pre-backfill state should not error",).toBeUndefined();

    await db.insertInto("users",).values({
      id: "backfill-user",
      username: "backfill-user",
      display_name: "Backfill User",
    },).execute();

    await db.insertInto("worlds",).values({
      id: "backfill-world",
      owner_id: "backfill-user",
      name: "Backfill World",
    },).execute();

    for (const [i, fixture,] of FIXTURES.entries()) {
      await db.insertInto("chats",).values({
        id: `backfill-chat-${i}`,
        name: fixture.name,
        type: fixture.type,
        mode: fixture.mode,
        created_by: "backfill-user",
        world_id: fixture.worldId ?? null,
        gm_config: fixture.gmConfig ?? null,
        purpose: fixture.purpose ?? null,
      },).execute();
    }

    return { db, sqlite, migrator, };
  }

  /**
   * @param db
   */
  async function purposeByName(db: Kysely<any>,): Promise<Record<string, string | null>> {
    const rows = await db
      .selectFrom("chats",)
      .select(["name", "purpose", "type", "mode",],)
      .execute();

    return Object.fromEntries(rows.map((r,) => [r.name, r.purpose,]),);
  }

  afterEach(() => {
    setTestDatabase(null,);
  },);

  test(
    "up() classifies legacy shapes per the ticket mapping table",
    async () => {
      const { db, sqlite, migrator, } = await seededLegacyDb();
      try {
        const applied = await migrator.migrateToLatest();
        expect(applied.error, "applying the backfill should not error",).toBeUndefined();

        const purposes = await purposeByName(db,);
        for (const fixture of FIXTURES) {
          expect(
            purposes[fixture.name],
            `purpose for "${fixture.name}" (${fixture.type}/${fixture.mode})`,
          ).toBe(fixture.expected,);
        }

        // Pure data migration: type/mode must be untouched on every row.
        const rows = await db.selectFrom("chats",).select(["name", "type", "mode",],).execute();
        for (const row of rows) {
          const fixture = FIXTURES.find((f,) => f.name === row.name);
          expect(fixture, `fixture missing for seeded row "${row.name}"`,).toBeDefined();
          expect(row.type, `type for "${row.name}"`,).toBe(fixture!.type,);
          expect(row.mode, `mode for "${row.name}"`,).toBe(fixture!.mode,);
        }
      } finally {
        await db.destroy();
        sqlite.close();
      }
    },
    120000,
  );

  test(
    "down() restores the pre-backfill state and a re-up re-derives it",
    async () => {
      const { db, sqlite, migrator, } = await seededLegacyDb();
      try {
        await migrator.migrateToLatest();

        const rolledBack = await migrator.migrateDown();
        expect(rolledBack.error, "rolling the backfill back should not error",).toBeUndefined();

        const afterDown = await purposeByName(db,);
        for (const fixture of FIXTURES) {
          if (fixture.purpose !== undefined) {
            // Rows that carried a purpose BEFORE the backfill keep it, unless
            // they share a classifier shape: the documented recompute inverse
            // resets world-bound rpg rows (shared with legacy R1) — the re-up
            // below re-derives the identical value.
            const expectCleared = fixture.expected !== null &&
              fixture.expected === fixture.purpose && fixture.worldId !== undefined;

            expect(
              afterDown[fixture.name],
              `post-down purpose for "${fixture.name}"`,
            ).toBe(expectCleared ? null : fixture.purpose,);
          } else {
            // Legacy rows: the backfill is fully reverted.
            expect(
              afterDown[fixture.name],
              `post-down purpose for "${fixture.name}"`,
            ).toBeNull();
          }
        }

        // Roundtrip: the second up() re-derives the exact same classification.
        const reapplied = await migrator.migrateToLatest();
        expect(reapplied.error, "re-applying the backfill should not error",).toBeUndefined();

        const afterReUp = await purposeByName(db,);
        for (const fixture of FIXTURES) {
          expect(
            afterReUp[fixture.name],
            `re-up purpose for "${fixture.name}"`,
          ).toBe(fixture.expected,);
        }
      } finally {
        await db.destroy();
        sqlite.close();
      }
    },
    120000,
  );
});
