/**
 * Final-schema behavior for prompt_template bindings and workflow modality.
 *
 * The retired 021/022 pair rebuilt `prompt_templates` while `chats` held
 * inbound references. The 14-file baseline ships the final table inline, so
 * the mid-chain rebuild fixture is gone. The load-bearing oracle survives:
 * `chats.prompt_template_id` is a real FK with ON DELETE SET NULL, bound chats
 * keep their binding, unbound chats stay unbound, and foreign_key_check is
 * clean. The workflow CHECK, per-family single-default rule and column
 * defaults are asserted on the shipped schema.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";

import { createSqliteDialect, } from "./index";
import { getMigrationFiles, } from "./migrate";

/** Apply the 14-file baseline to this test's isolated in-memory DB. */
async function applyBaseline(database: Kysely<unknown>,): Promise<void> {
  for (const migration of Object.values(await getMigrationFiles(),)) {
    await migration.up(database,);
  }
}

function readChatTemplateId(sqlite: Database, id: string,): string | null {
  const row = sqlite
    .query<{ prompt_template_id: string | null }, [string,]>("SELECT prompt_template_id FROM chats WHERE id = ?",)
    .get(id,);

  return row?.prompt_template_id ?? null;
}

function foreignKeyViolations(sqlite: Database,): unknown[] {
  return sqlite.query("PRAGMA foreign_key_check",).all();
}

describe("prompt_templates workflow FK (final schema)", () => {
  let raw: Database;
  let db: Kysely<unknown>;

  beforeEach(async () => {
    raw = new Database(":memory:",);
    db = new Kysely({ dialect: createSqliteDialect(raw,), },);
    await applyBaseline(db,);
    raw.run("INSERT INTO users (id, username, display_name) VALUES ('u1', 'op', 'Operator')",);
  },);

  afterEach(async () => {
    await db.destroy();
    raw.close();
  },);

  /** One bound template, one free template, one bound chat and one free chat. */
  function seedBoundChat(): void {
    raw.run(
      "INSERT INTO prompt_templates (id, owner_id, modality, name) VALUES ('t-bound', 'u1', 'llm', 'Bound')",
    );

    raw.run(
      "INSERT INTO prompt_templates (id, owner_id, modality, name) VALUES ('t-free', 'u1', 'image', 'Free')",
    );

    raw.run(
      "INSERT INTO chats (id, name, created_by, prompt_template_id) VALUES ('c-bound', 'Bound chat', 'u1', 't-bound')",
    );

    raw.run(
      "INSERT INTO chats (id, name, created_by, prompt_template_id) VALUES ('c-free', 'Free chat', 'u1', NULL)",
    );
  }

  test("chats.prompt_template_id is a real FK with ON DELETE SET NULL", () => {
    const fks = raw
      .query<{ from: string; table: string; to: string; on_delete: string }, []>("PRAGMA foreign_key_list(chats)",)
      .all();

    const binding = fks.find((fk,) => fk.from === "prompt_template_id");
    expect(binding,).toBeDefined();
    expect(binding!.table,).toBe("prompt_templates",);
    expect(binding!.on_delete.toUpperCase(),).toBe("SET NULL",);
  });

  test("bound chats keep their binding and unbound chats stay unbound", () => {
    seedBoundChat();
    expect(readChatTemplateId(raw, "c-bound",),).toBe("t-bound",);
    expect(readChatTemplateId(raw, "c-free",),).toBeNull();
    const count = raw.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM prompt_templates",).get();
    expect(count?.n,).toBe(2,);
    expect(foreignKeyViolations(raw,),).toEqual([],);
  });

  test("deleting a template nulls inbound bindings without touching other chats", () => {
    seedBoundChat();
    raw.run("DELETE FROM prompt_templates WHERE id = 't-bound'",);
    expect(readChatTemplateId(raw, "c-bound",),).toBeNull();
    expect(readChatTemplateId(raw, "c-free",),).toBeNull();
    expect(foreignKeyViolations(raw,),).toEqual([],);
  });

  test("accepts modality 'workflow' and rejects unknown values", () => {
    raw.run(
      "INSERT INTO prompt_templates (id, owner_id, modality, name) VALUES ('t-wf', 'u1', 'workflow', 'Anima')",
    );

    const row = raw
      .query<{ modality: string }, []>("SELECT modality FROM prompt_templates WHERE id = 't-wf'",)
      .get();

    expect(row?.modality,).toBe("workflow",);

    // The CHECK is still enforced — this is not a free-for-all text column.
    expect(() =>
      raw.run(
        "INSERT INTO prompt_templates (id, owner_id, modality, name) VALUES ('t-bad', 'u1', 'not-a-modality', 'Bad')",
      )
    ).toThrow();
  });

  test("new columns default so no row is retroactively default or disabled", () => {
    raw.run(
      "INSERT INTO prompt_templates (id, owner_id, modality, name) VALUES ('t-plain', 'u1', 'workflow', 'Plain')",
    );

    const row = raw
      .query<{ is_default: string; enabled: string }, []>(
        "SELECT is_default, enabled FROM prompt_templates WHERE id = 't-plain'",
      )
      .get();

    expect(row?.is_default,).toBe("not_default",);
    expect(row?.enabled,).toBe("enabled",);
  });

  test("one default per (model_family, modality), NULL family included", () => {
    raw.run(`INSERT INTO prompt_templates
      (id, owner_id, modality, name, model_family, is_default)
      VALUES ('d1', 'u1', 'workflow', 'A', 'sdxl', 'default')`,);

    expect(() =>
      raw.run(`INSERT INTO prompt_templates
      (id, owner_id, modality, name, model_family, is_default)
      VALUES ('d2', 'u1', 'workflow', 'B', 'sdxl', 'default')`,)
    ).toThrow();

    raw.run(`INSERT INTO prompt_templates
      (id, owner_id, modality, name, model_family, is_default)
      VALUES ('d3', 'u1', 'workflow', 'C', 'anima', 'default')`,);

    raw.run(`INSERT INTO prompt_templates
      (id, owner_id, modality, name, is_default)
      VALUES ('d4', 'u1', 'workflow', 'D', 'default')`,);

    expect(() =>
      raw.run(`INSERT INTO prompt_templates
      (id, owner_id, modality, name, is_default)
      VALUES ('d5', 'u1', 'workflow', 'E', 'default')`,)
    ).toThrow();
  });
});
