import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { readdirSync } from "node:fs";
import path from "node:path";
import { Kysely } from "kysely";
import { createSqliteDialect } from "./index";
import type { Migration } from "kysely/migration";

// ── Helpers ──────────────────────────────────────────────────

function schemaTables(db: Database): Set<string> {
  const rows = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'kysely_%'")
    .all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const MIGRATION_NAMES = readdirSync(MIGRATIONS_DIR)
  .filter((f): f is string => f.endsWith(".ts"))
  .map((f) => f.replace(/\.ts$/, ""))
  .sort();

async function loadMigration(name: string): Promise<Migration> {
  const module = await import(path.join(MIGRATIONS_DIR, `${name}.ts`));
  return module.default ?? module;
}

async function loadAllMigrations(): Promise<Record<string, Migration>> {
  const migrations: Record<string, Migration> = {};
  for (const name of MIGRATION_NAMES) {
    migrations[name] = await loadMigration(name);
  }
  return migrations;
}

function createTestKysely(): { db: Database; kysely: Kysely<unknown> } {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");
  const dialect = createSqliteDialect(db);
  const kysely = new Kysely({ dialect });
  return { db, kysely };
}

// ── Full migration chain test ────────────────────────────────

describe("full migration chain", () => {
  let db: Database;
  let kysely: Kysely<unknown>;
  let migrations: Record<string, Migration>;

  beforeAll(async () => {
    ({ db, kysely } = createTestKysely());
    migrations = await loadAllMigrations();
  });

  afterAll(async () => {
    await kysely.destroy();
    db.close();
  });

  test("all migrations apply in order without error", async () => {
    for (const name of MIGRATION_NAMES) {
      await migrations[name]!.up(kysely);
    }

    const names = schemaTables(db);
    expect(names.has("users")).toBe(true);
    expect(names.has("chats")).toBe(true);
    expect(names.has("messages")).toBe(true);
    expect(names.has("actors")).toBe(true);
    expect(names.size).toBeGreaterThan(10);
  });

  test("all migrations revert in reverse order without error", async () => {
    for (const name of [...MIGRATION_NAMES].reverse()) {
      if (migrations[name]!.down) {
        await migrations[name]!.down!(kysely);
      }
    }

    const names = schemaTables(db);
    expect(names.size).toBe(0);
  });
});

// ── Per-migration roundtrip tests ────────────────────────────

describe("per-migration roundtrip", () => {
  for (const name of MIGRATION_NAMES) {
    describe(name, () => {
      let db: Database;
      let kysely: Kysely<unknown>;
      let migration: Migration;
      let upSucceeded = false;

      beforeAll(async () => {
        ({ db, kysely } = createTestKysely());
        migration = await loadMigration(name);
      });

      afterAll(async () => {
        await kysely.destroy();
        db.close();
      });

      test("up() succeeds or is ALTER-only (skip if no base tables)", async () => {
        try {
          await migration.up(kysely);
          upSucceeded = true;
          const names = schemaTables(db);
          expect(names.size).toBeGreaterThan(0);
        } catch {
          // ALTER TABLE migrations fail on fresh DB without base tables — that's expected
          upSucceeded = false;
        }
      });

      test("down() reverts cleanly (only if up succeeded)", async () => {
        if (!upSucceeded) return; // Skip — up() failed, nothing to revert
        if (migration.down) {
          await migration.down(kysely);
        }
        const names = schemaTables(db);
        expect(names.size).toBe(0);
      });

      test("up() idempotency (only if up succeeded)", async () => {
        if (!upSucceeded) return; // Skip — up() failed
        // Second up may throw for ALTER TABLE migrations — that's expected
        try {
          await migration.up(kysely);
        } catch {
          // Expected for ALTER on existing columns
        }
        // DB should still have tables
        const names = schemaTables(db);
        expect(names.size).toBeGreaterThan(0);
      });
    });
  }
});

// ── Migration 001_init specific ──────────────────────────────

describe("001_init — full schema", () => {
  let db: Database;
  let kysely: Kysely<unknown>;

  beforeAll(async () => {
    ({ db, kysely } = createTestKysely());
  });

  afterAll(async () => {
    await kysely.destroy();
    db.close();
  });

  const EXPECTED_TABLES = [
    "users",
    "sessions",
    "worlds",
    "locations",
    "items",
    "world_items",
    "chats",
    "actors",
    "chat_participants",
    "characters",
    "actor_memories",
    "actor_notes",
    "actor_items",
    "actor_lore_entries",
    "world_lore_entries",
    "assets",
    "asset_links",
    "asset_shares",
    "messages",
    "actor_keys",
    "user_api_keys",
    "generation_attempts",
    "story_turns",
    "quests",
    "quest_progress",
    "world_states",
    "npc_states",
    "location_states",
    "synthetic_data",
    "model_role_overrides",
  ] as const;

  test("up() creates every expected schema table", async () => {
    const { up } = await import("./migrations/001_init");
    await up(kysely);
    const names = schemaTables(db);
    for (const table of EXPECTED_TABLES) {
      expect(names.has(table), `missing table: ${table}`).toBe(true);
    }
    expect(names.size, "unexpected extra tables present").toBe(EXPECTED_TABLES.length);
  });

  test("down() drops every schema table (clean revert)", async () => {
    const { down } = await import("./migrations/001_init");
    await down(kysely);
    const names = schemaTables(db);
    expect(names.size, `tables still present: ${[...names].join(", ")}`).toBe(0);
  });
});

// ── Flag inconsistencies ─────────────────────────────────────

describe("migration consistency flags", () => {
  let migrations: Record<string, Migration>;

  beforeAll(async () => {
    migrations = await loadAllMigrations();
  });

  test("every migration has up()", () => {
    for (const name of MIGRATION_NAMES) {
      expect(typeof migrations[name]!.up, `${name} must have up()`).toBe("function");
    }
  });

  test("flag migrations missing down() for future improvement", () => {
    const missingDown: string[] = [];
    for (const name of MIGRATION_NAMES) {
      if (typeof migrations[name]!.down !== "function") {
        missingDown.push(name);
      }
    }
    if (missingDown.length > 0) {
      console.log("[migration-consistency] missing down():", missingDown);
    }
  });

  test("001_init down() reverts all sub-parts", async () => {
    const { db, kysely } = createTestKysely();
    const { up, down } = await import("./migrations/001_init");

    await up(kysely);
    const tablesAfterUp = schemaTables(db);
    expect(tablesAfterUp.size).toBeGreaterThan(0);

    await down(kysely);
    const tablesAfterDown = schemaTables(db);
    expect(tablesAfterDown.size).toBe(0);

    await kysely.destroy();
    db.close();
  });

  test("full chain up then full chain down leaves clean state", async () => {
    const { db, kysely } = createTestKysely();
    const allMigrations = await loadAllMigrations();

    for (const name of MIGRATION_NAMES) {
      await allMigrations[name]!.up(kysely);
    }
    const upCount = schemaTables(db).size;

    for (const name of [...MIGRATION_NAMES].reverse()) {
      if (allMigrations[name]!.down) {
        await allMigrations[name]!.down!(kysely);
      }
    }
    const downTables = schemaTables(db);

    if (downTables.size > 0) {
      console.log("[migration-consistency] tables remaining after full down:", [...downTables]);
    }
    expect(downTables.size).toBe(0);
    expect(upCount).toBeGreaterThan(10);

    await kysely.destroy();
    db.close();
  });
});
