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
import { resolve, } from "node:path";
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
  test("returns the whole append-only chain, collapsed init first", () => {
    const dir = resolve(import.meta.dir, "../../src/db/migrations",);
    const files = listMigrationFiles(dir,);
    // The chain is append-only (src/db/migrations/README.md): one collapsed
    // base plus numbered increments, applied in filename order. Asserting a
    // count here would just churn on every new migration — assert the parts
    // that are actually load-bearing for the generators that consume this:
    // the base is present, ordering is stable, and nothing non-migration is
    // swept in (README.md must not appear).
    expect(files.length,).toBeGreaterThan(1,);
    expect(files[0],).toMatch(/001_init\.ts$/,);
    expect(files.some((f,) => f.endsWith("README.md",)),).toBe(false,);
    const suffixes = files.map((f,) => f.slice(dir.length + 1,));
    expect(suffixes,).toEqual([...suffixes,].sort(),);
  });
});

describe("parseMigration", () => {
  test("parses the collapsed init into creates", () => {
    const file = resolve(import.meta.dir, "../../src/db/migrations/001_init.ts",);
    const { creates, } = parseMigration(file,);
    expect(creates.size,).toBeGreaterThan(100,);
    const users = creates.get("users",);
    expect(users?.createdBy,).toBe("001_init.ts",);
    expect(users?.columns.id?.primaryKey,).toBe(true,);
  });
});
