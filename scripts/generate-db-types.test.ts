// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generated DB types — the primary-key rule.
 *
 * A primary key is `Generated<>` ONLY when the database fills it: a DEFAULT
 * expression, or the SQLite INTEGER PRIMARY KEY rowid alias (auto-assigned,
 * no DEFAULT clause). Every other primary key — a TEXT PRIMARY KEY without a
 * DEFAULT — types as a plain `string`, so the insert object REQUIRES the id.
 * An id-less INSERT would otherwise store `id = NULL`, silently.
 *
 * The rule lives in scripts/generate-db-types.ts; these assertions pin it.
 */
import { describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { dbSuppliesPrimaryKey, tsType, } from "./generate-db-types";
import type { ColumnDef, } from "./lib/migration-parser";

/** A column definition with the given overrides. */
function column(overrides: Partial<ColumnDef>,): ColumnDef {
  return { type: "text", notNull: false, hasDefault: false, primaryKey: false, ...overrides, };
}

/** The committed core schema — the generator's own output. */
function coreSchema(): string {
  // TODO(env): bun-only - add node shim when node target lands
  return readFileSync(join(import.meta.dir, "../src/db/schema-core.ts",), "utf8",);
}

describe("generated primary-key types", () => {
  test("a TEXT primary key without a DEFAULT types as a plain string", () => {
    const cols = { id: column({ primaryKey: true, },), name: column({ notNull: true, },), };

    expect(tsType(cols.id!, "widgets", "id", cols,),).toBe("string",);
    expect(dbSuppliesPrimaryKey(cols, "id",),).toBe(false,);
  });

  test("a primary key with a DEFAULT stays Generated", () => {
    const cols = { id: column({ primaryKey: true, hasDefault: true, notNull: true, },), };

    expect(tsType(cols.id!, "widgets", "id", cols,),).toBe("Generated<string>",);
    expect(dbSuppliesPrimaryKey(cols, "id",),).toBe(true,);
  });

  test("the INTEGER PRIMARY KEY rowid alias stays Generated", () => {
    const cols = { id: column({ type: "integer", primaryKey: true, },), };

    expect(tsType(cols.id!, "widgets", "id", cols,),).toBe("Generated<number>",);
    expect(dbSuppliesPrimaryKey(cols, "id",),).toBe(true,);
  });

  test("a non-primary-key column with a DEFAULT is unchanged", () => {
    const cols = { created_at: column({ hasDefault: true, notNull: true, },), };

    expect(tsType(cols.created_at!, "widgets", "created_at", cols,),).toBe("Generated<string>",);
  });

  test("the committed schema types a no-default TEXT primary key as string", () => {
    const schema = coreSchema();

    expect(schema,).toContain("export interface Users {\n  id: string;",);
    expect(schema,).toContain("export interface UserApiKeys {\n  id: string;",);
  });

  test("the committed schema keeps Generated for a defaulted primary key", () => {
    expect(coreSchema(),).toContain("export interface InteractionLogs {\n  id: Generated<string>;",);
  });
});
