/**
 * Migration 021/022 regression: the prompt_templates rebuild must not
 * destroy inbound chat bindings.
 *
 * 021 recreates `prompt_templates` to relax `ck_prompt_templates_modality`,
 * and 022 drops the table again on rollback. `chats.prompt_template_id`
 * references it with ON DELETE SET NULL, so a naive rebuild silently NULLs
 * every chat's template binding — the data loss is invisible unless asserted.
 *
 * Kysely wraps each migration in a transaction, so `PRAGMA foreign_keys = OFF`
 * cannot be used, and `defer_foreign_keys = ON` does not help: it defers
 * constraint *enforcement*, not ON DELETE *actions*. Both were verified to
 * still destroy the bindings. The migrations therefore snapshot and restore.
 */
import { Database, } from "bun:sqlite";
import { afterEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";
import { createLogger, } from "../logger";
import { createSqliteDialect, setTestDatabase, } from "./index";

const LAST_PRE_WORKFLOW_MIGRATION = "020_actor_story_points_partial_unique";

function buildMigrationProvider() {
  return {
    async getMigrations(): Promise<Record<string, Migration>> {
      const dir = path.join(__dirname, "migrations",);
      const files = readdirSync(dir,)
        .filter((f,) => typeof f === "string" && f.endsWith(".ts",))
        .toSorted((a, b,) => a.localeCompare(b,));
      const migrations: Record<string, Migration> = {};
      for (const file of files) {
        const mod = await import(path.join(dir, file,));
        migrations[file.replace(/\.ts$/, "",)] = mod.default ?? mod;
      }
      return migrations;
    },
  };
}

function createFreshDb(): { db: Kysely<unknown>; sqlite: Database } {
  const sqlite = new Database(":memory:",);
  const db = new Kysely({ dialect: createSqliteDialect(sqlite,), },);
  setTestDatabase(db as never,);
  return { db, sqlite, };
}

/** Seed a user, a template, and two chats — one bound, one not. */
function seedBoundChat(sqlite: Database,): void {
  sqlite.run("INSERT INTO users (id, username, display_name) VALUES ('u1', 'op', 'Operator')",);
  sqlite.run(
    `INSERT INTO prompt_templates (id, owner_id, modality, name)
     VALUES ('t-bound', 'u1', 'llm', 'Bound')`,
  );
  sqlite.run(
    `INSERT INTO prompt_templates (id, owner_id, modality, name)
     VALUES ('t-free', 'u1', 'image', 'Free')`,
  );
  // Raw SQL: insertChats() has no prompt_template_id option.
  sqlite.run(
    `INSERT INTO chats (id, name, created_by, prompt_template_id)
     VALUES ('c-bound', 'Bound chat', 'u1', 't-bound')`,
  );
  sqlite.run(
    `INSERT INTO chats (id, name, created_by, prompt_template_id)
     VALUES ('c-free', 'Free chat', 'u1', NULL)`,
  );
}

function readChatTemplateId(sqlite: Database, id: string,): string | null {
  const row = sqlite
    .query<{ prompt_template_id: string | null }, [string,]>(`
      SELECT prompt_template_id FROM chats WHERE id = ?
    `,)
    .get(id,);
  return row?.prompt_template_id ?? null;
}

function foreignKeyViolations(sqlite: Database,): unknown[] {
  return sqlite.query("PRAGMA foreign_key_check",).all();
}

try {
  createLogger({ level: "error", },);
} catch {
  // already initialized
}

describe("migration 021/022 prompt_templates rebuild", () => {
  afterEach(() => {
    setTestDatabase(null,);
  },);

  test("preserves chats.prompt_template_id across the rebuild", async () => {
    const { db, sqlite, } = createFreshDb();
    const provider = buildMigrationProvider();
    const migrator = new Migrator({ db, provider, },);

    await migrator.migrateTo(LAST_PRE_WORKFLOW_MIGRATION,);
    seedBoundChat(sqlite,);
    expect(readChatTemplateId(sqlite, "c-bound",),).toBe("t-bound",);

    const result = await migrator.migrateToLatest();
    expect(result.error, "migrateToLatest should not error",).toBeUndefined();

    // The whole point: a bound chat keeps its binding.
    expect(readChatTemplateId(sqlite, "c-bound",),).toBe("t-bound",);
    // An unbound chat must stay unbound, not gain a bogus value.
    expect(readChatTemplateId(sqlite, "c-free",),).toBeNull();
    // Rows survived the copy.
    const count = sqlite
      .query<{ n: number }, []>("SELECT COUNT(*) AS n FROM prompt_templates",)
      .get();
    expect(count?.n,).toBe(2,);
    expect(foreignKeyViolations(sqlite,),).toEqual([],);

    await db.destroy();
    sqlite.close();
  });

  test("accepts modality 'workflow' and rejects unknown values", async () => {
    const { db, sqlite, } = createFreshDb();
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);
    const up = await migrator.migrateToLatest();
    expect(up.error,).toBeUndefined();

    sqlite.run("INSERT INTO users (id, username, display_name) VALUES ('u1', 'op', 'Operator')",);
    sqlite.run(
      `INSERT INTO prompt_templates (id, owner_id, modality, name)
       VALUES ('t-wf', 'u1', 'workflow', 'Anima')`,
    );
    const modality = sqlite
      .query<{ modality: string }, []>("SELECT modality FROM prompt_templates WHERE id = 't-wf'",)
      .get();
    expect(modality?.modality,).toBe("workflow",);

    // The CHECK is still enforced — this is not a free-for-all text column.
    expect(() => {
      sqlite.run(
        `INSERT INTO prompt_templates (id, owner_id, modality, name)
         VALUES ('t-bad', 'u1', 'not-a-modality', 'Bad')`,
      );
    },).toThrow();

    await db.destroy();
    sqlite.close();
  });

  test("new columns default so no row is retroactively default or disabled", async () => {
    const { db, sqlite, } = createFreshDb();
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);

    await migrator.migrateTo(LAST_PRE_WORKFLOW_MIGRATION,);
    seedBoundChat(sqlite,);
    await migrator.migrateToLatest();

    const row = sqlite
      .query<{ is_default: string; enabled: string }, [string,]>(
        "SELECT is_default, enabled FROM prompt_templates WHERE id = 't-bound'",
      )
      .get("t-bound",);
    expect(row?.is_default,).toBe("not_default",);
    expect(row?.enabled,).toBe("enabled",);

    await db.destroy();
    sqlite.close();
  });

  test("one default per (model_family, modality), NULL family included", async () => {
    const { db, sqlite, } = createFreshDb();
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);
    const up = await migrator.migrateToLatest();
    expect(up.error,).toBeUndefined();

    sqlite.run("INSERT INTO users (id, username, display_name) VALUES ('u1', 'op', 'Operator')",);
    sqlite.run(
      `INSERT INTO prompt_templates
         (id, owner_id, modality, name, model_family, is_default)
       VALUES ('d1', 'u1', 'workflow', 'A', 'sdxl', 'default')`,
    );
    // Second default for the same family — rejected.
    expect(() => {
      sqlite.run(
        `INSERT INTO prompt_templates
           (id, owner_id, modality, name, model_family, is_default)
         VALUES ('d2', 'u1', 'workflow', 'B', 'sdxl', 'default')`,
      );
    },).toThrow();
    // A different family is fine.
    sqlite.run(
      `INSERT INTO prompt_templates
         (id, owner_id, modality, name, model_family, is_default)
       VALUES ('d3', 'u1', 'workflow', 'C', 'anima', 'default')`,
    );
    // NULL family gets its own single-default budget.
    sqlite.run(
      `INSERT INTO prompt_templates
         (id, owner_id, modality, name, is_default)
       VALUES ('d4', 'u1', 'workflow', 'D', 'default')`,
    );
    expect(() => {
      sqlite.run(
        `INSERT INTO prompt_templates
           (id, owner_id, modality, name, is_default)
         VALUES ('d5', 'u1', 'workflow', 'E', 'default')`,
      );
    },).toThrow();

    await db.destroy();
    sqlite.close();
  });

  test("rolls back to before the workflow columns without losing chat bindings", async () => {
    const { db, sqlite, } = createFreshDb();
    const migrator = new Migrator({ db, provider: buildMigrationProvider(), },);

    await migrator.migrateTo(LAST_PRE_WORKFLOW_MIGRATION,);
    seedBoundChat(sqlite,);
    await migrator.migrateToLatest();
    expect(readChatTemplateId(sqlite, "c-bound",),).toBe("t-bound",);

    // Target the pre-workflow point explicitly rather than a single
    // migrateDown(): migrations added after 022 (e.g. 024) sit on top, and one
    // step down would no longer be the workflow rebuild this test is about.
    const down = await migrator.migrateTo(LAST_PRE_WORKFLOW_MIGRATION,);
    expect(down.error, "migrateTo should not error",).toBeUndefined();

    expect(readChatTemplateId(sqlite, "c-bound",),).toBe("t-bound",);
    expect(foreignKeyViolations(sqlite,),).toEqual([],);
    const cols = sqlite
      .query<{ name: string }, []>('PRAGMA table_info("prompt_templates")',)
      .all()
      .map((r,) => r.name);
    expect(cols,).not.toContain("is_default",);

    await db.destroy();
    sqlite.close();
  });
});
