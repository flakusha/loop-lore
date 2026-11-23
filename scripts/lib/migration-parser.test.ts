// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the shared migration parser (scripts/lib/migration-parser).
 *
 * Covers the pure column parser plus file enumeration against the real
 * migrations dir. parseMigration itself is exercised end-to-end by
 * check-db-schemas.ts / schema-sync.test.ts on every regeneration.
 */
import { describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, resolve, } from "node:path";
import { listMigrationFiles, parseColumns, parseMigration, } from "./migration-parser";

describe("parseColumns", () => {
  test("extracts name, type, and constraint flags", () => {
    const block = `.createTable("users",)
      .addColumn("id", "text", (c,) => c.primaryKey(),)
      .addColumn("name", "text", (c,) => c.notNull(),)
      .addColumn("score", "integer", (c,) => c.defaultTo(0,),)
      .execute()`;
    const cols = parseColumns(block,);
    expect(cols.id,).toEqual({ type: "text", notNull: false, hasDefault: false, primaryKey: true, },);
    expect(cols.name,).toEqual({ type: "text", notNull: true, hasDefault: false, primaryKey: false, },);
    expect(cols.score,).toEqual({ type: "integer", notNull: false, hasDefault: true, primaryKey: false, },);
  });

  test("skips entries without a storage type", () => {
    const cols = parseColumns(`.alterTable("t",).addColumn("x", (c,) => c,),.execute()`,);
    expect(cols,).toEqual({},);
  });
});

describe("listMigrationFiles", () => {
  test("returns the whole 14-file baseline, 001_core first", () => {
    const dir = resolve(import.meta.dir, "../../src/db/migrations",);
    const files = listMigrationFiles(dir,);
    // The consolidated baseline (src/db/migrations/README.md) is a set of
    // final-form files applied in filename order. Asserting a count here would
    // churn on every new migration — assert what the generators consume: the
    // base is present, ordering is stable, and no non-migration is swept in.
    expect(files.length,).toBeGreaterThan(1,);
    expect(files[0],).toMatch(/001_core\.ts$/,);
    expect(files.some((f,) => f.endsWith("README.md",)),).toBe(false,);
    const suffixes = files.map((f,) => f.slice(dir.length + 1,));
    expect(suffixes,).toEqual([...suffixes,].sort(),);
  });
});

describe("parseMigration", () => {
  /**
   * The alter/rename/drop branches. The file header says parseMigration is
   * "exercised end-to-end by check-db-schemas.ts / schema-schema.test.ts",
   * but that only ever parses 001_core.ts, which is pure createTable — so
   * every branch below went unmeasured until these landed.
   *
   * Resource contract: each test writes one fixture into its own
   * mkdtempSync dir and removes it in `finally`, so no path is shared and a
   * failed assertion still cleans up. No ports, DB, or process-global is
   * touched (the `logRenames` console.log branch is deliberately left
   * uncovered rather than stubbing a global other tests share).
   */
  function withMigration(body: string, fn: (file: string,) => void,): void {
    const dir = mkdtempSync(join(tmpdir(), "ll-migpar-",),);
    const file = join(dir, "999_probe.ts",);
    writeFileSync(
      file,
      `export async function up(db: unknown): Promise<void> {\n${body}\n}\n`,
    );
    try {
      fn(file,);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  }

  test("parses the consolidated baseline into creates", () => {
    const dir = resolve(import.meta.dir, "../../src/db/migrations",);
    const creates = new Map(
      listMigrationFiles(dir,).flatMap((file,) => [...parseMigration(file,).creates.entries(),]),
    );
    expect(creates.size,).toBe(252,);
    const users = creates.get("users",);
    expect(users?.createdBy,).toBe("001_core.ts",);
    expect(users?.columns.id?.primaryKey,).toBe(true,);
  });

  test("renameColumn drops the old name and carries the new one's type over", () => {
    withMigration(
      [
        // The type lookup looks back up to 500 chars, so this addColumn is
        // what supplies "text" for the renamed column below.
        `await db.schema.alterTable("users_ck",).addColumn("display_name", "text",).execute();`,
        // The constraint flags are read off the RENAME block, not off the
        // addColumn above — assert both, or a swap of the two goes unnoticed.
        `await db.schema.alterTable("users_ck",).renameColumn("display_name", "screen_name",).notNull().defaultTo("",).execute();`,
      ].join("\n",),
      (file,) => {
        const { alters, drops, } = parseMigration(file,);
        expect(drops.get("users_ck",),).toEqual(new Set(["display_name",],),);
        expect(alters.get("users_ck",)?.screen_name,).toEqual({
          type: "text",
          notNull: true,
          hasDefault: true,
          primaryKey: false,
        },);
      },
    );
  });

  test("a bare renameColumn with no nearby addColumn still reports the pair", () => {
    // The case the `renames` channel exists for. A forward rename migration
    // states every rename as a literal `alterTable(t).renameColumn(a, b)` with
    // no addColumn to supply a type, so the 500-char type lookup finds nothing
    // and `alters` stays empty.
    // Without `renames`, the generators would see the old name dropped and no
    // new name at all — silently deleting the column from every artifact.
    withMigration(
      `await db.schema.alterTable("users",).renameColumn("format_version", "row_version",).execute();`,
      (file,) => {
        const { alters, drops, renames, } = parseMigration(file,);
        expect(drops.get("users",),).toEqual(new Set(["format_version",],),);
        expect(alters.get("users",),).toBeUndefined();
        expect(renames.get("users",),).toEqual([["format_version", "row_version",],],);
      },
    );
  });

  test("renames accumulate per table without cross-table bleed", () => {
    withMigration(
      [
        `await db.schema.alterTable("users",).renameColumn("format_version", "row_version",).execute();`,
        `await db.schema.alterTable("users",).renameColumn("password_hash", "secret_hash",).execute();`,
        `await db.schema.alterTable("actors",).renameColumn("format_version", "row_version",).execute();`,
      ].join("\n",),
      (file,) => {
        const { renames, } = parseMigration(file,);
        expect(renames.get("users",),).toEqual([
          ["format_version", "row_version",],
          ["password_hash", "secret_hash",],
        ],);
        expect(renames.get("actors",),).toEqual([["format_version", "row_version",],],);
      },
    );
  });

  test("a 24-rename fixture keeps every documented column", () => {
    // The retired 057 file is gone from the 14-file baseline. The renames
    // channel is still load-bearing for generators, so exercise it with the
    // same 24 literal renames through a scratch fixture.
    const pairs: [string, string, string,][] = [
      ["users", "format_version", "row_version",],
      ["users", "password_hash", "secret_hash",],
      ["sessions", "token_hash", "secret_hash",],
      ["actors", "format_version", "row_version",],
      ["messages", "format_version", "row_version",],
      ["personas", "format_version", "row_version",],
      ["message_search_tokens", "token", "term",],
      ["character_avatar_config", "fallback_chain", "fallback_order",],
      ["request_results", "data_version", "content_version",],
      ["assets", "data_version", "content_version",],
      ["worlds", "data_version", "content_version",],
      ["characters", "data_version", "content_version",],
      ["character_stats", "data_version", "content_version",],
      ["chats", "data_version", "content_version",],
      ["messages", "data_version", "content_version",],
      ["items", "data_version", "content_version",],
      ["world_lore_entries", "data_version", "content_version",],
      ["actor_lore_entries", "data_version", "content_version",],
      ["quests", "data_version", "content_version",],
      ["locations", "data_version", "content_version",],
      ["blog_posts", "data_version", "content_version",],
      ["shadow_notes", "data_version", "content_version",],
      ["whitenotes", "data_version", "content_version",],
      ["crafting_recipes", "data_version", "content_version",],
    ];
    withMigration(
      pairs.map(([table, from, to,],) =>
        `await db.schema.alterTable("${table}",).renameColumn("${from}", "${to}",).execute();`
      ).join("\n",),
      (file,) => {
        const { renames, } = parseMigration(file,);
        expect([...renames.values(),].flat(), "24 renames",).toHaveLength(24,);
        expect(renames.get("users",),).toEqual([
          ["format_version", "row_version",],
          ["password_hash", "secret_hash",],
        ],);
        expect(renames.get("message_search_tokens",),).toEqual([["token", "term",],],);
        expect(renames.get("character_avatar_config",),).toEqual([["fallback_chain", "fallback_order",],],);
      },
    );
  });

  test("renameTo marks the table it renamed away from as dropped", () => {
    withMigration(
      `await db.schema.alterTable("users_tmp",).renameTo("users",).execute();`,
      (file,) => {
        const { droppedTables, } = parseMigration(file,);
        expect(droppedTables.has("users_tmp",),).toBe(true,);
      },
    );
  });

  test("a renameTo with no preceding alterTable registers nothing", () => {
    withMigration(`await db.schema.renameTo("users",).execute();`, (file,) => {
      const { droppedTables, } = parseMigration(file,);
      expect(droppedTables.size,).toBe(0,);
    },);
  });

  test("dropColumn records the dropped column on its table", () => {
    withMigration(
      `await db.schema.alterTable("users",).dropColumn("legacy_flag",).execute();`,
      (file,) => {
        const { drops, } = parseMigration(file,);
        expect(drops.get("users",),).toEqual(new Set(["legacy_flag",],),);
      },
    );
  });
});
