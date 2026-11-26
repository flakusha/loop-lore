/**
 * Canonical equivalence of the 14-file consolidated baseline.
 *
 * The golden fixture is the canonical dump of the DB produced by the retired
 * 122-file chain. Generated artifacts do not cover raw-SQL indexes, triggers
 * or FTS virtual tables, so this test is the schema oracle for those objects.
 */

import { Database, } from "bun:sqlite";
import { describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { readdirSync, readFileSync, } from "node:fs";
import path from "node:path";
import { createSqliteDialect, } from "./index";
import { SCHEMA, } from "./schema-manifest";

// TODO(env): bun-only — bun:sqlite + createSqliteDialect; add a node:sqlite
// test adapter if a Node test target lands.

const MIGRATION_FILE = /^(\d{3})_[^/]+\.ts$/;
const MIGRATIONS_DIR = path.join(__dirname, "migrations",);
const FIXTURE_PATH = path.join(MIGRATIONS_DIR, "fixtures", "consolidated-schema-golden.json",);

interface MasterRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string;
}
interface Golden {
  master: MasterRow[];
  tables: Record<string, { info: unknown[]; foreignKeys: unknown[] }>;
}

const golden: Golden = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8",),);
const fileNames = readdirSync(MIGRATIONS_DIR,)
  .filter((name,) => MIGRATION_FILE.test(name,))
  .sort();

/**
 * @param text
 */
function canon(text: string | null,): string {
  return (text ?? "").replace(/"/g, "",).replace(/\s+/g, " ",).trim();
}

/**
 * @param database
 */
async function applyBaseline(database: Kysely<unknown>,): Promise<void> {
  for (const name of fileNames) {
    // Runtime-selected: filenames discovered from the migrations directory.
    const module = await import(path.resolve(MIGRATIONS_DIR, name,));
    await module.up(database,);
  }
}

describe("consolidated migration baseline", () => {
  test("matches the retired chain's canonical schema", async () => {
    const sqlite = new Database(":memory:",);
    const db = new Kysely({ dialect: createSqliteDialect(sqlite,), },);
    try {
      await applyBaseline(db,);
      const master = sqlite.query(
        `SELECT type, name, tbl_name, sql FROM sqlite_master
         WHERE name NOT LIKE 'kysely_%' AND name NOT LIKE 'sqlite_autoindex_kysely_%'
         ORDER BY type, name`,
      ).all() as MasterRow[];

      const actual = new Map(master.map((row,) => [`${row.type}|${row.name}`, row,]),);
      const expected = new Map(golden.master.map((row,) => [`${row.type}|${row.name}`, row,]),);
      expect([...actual.keys(),].sort(),).toEqual([...expected.keys(),].sort(),);
      for (const [key, row,] of expected) {
        const found = actual.get(key,)!;
        expect(found.tbl_name, key,).toBe(row.tbl_name,);
        expect(canon(found.sql,), key,).toBe(row.sql,);
      }

      for (const [name, table,] of Object.entries(golden.tables,)) {
        const quoted = `"${name.replaceAll('"', '""',)}"`;
        expect(sqlite.query(`PRAGMA table_info(${quoted})`,).all(), name,).toEqual(table.info,);
        expect(sqlite.query(`PRAGMA foreign_key_list(${quoted})`,).all(), name,)
          .toEqual(table.foreignKeys,);
      }

      expect(Object.keys(golden.tables,).length,).toBe(268,);
    } finally {
      await db.destroy();
    }
  });

  test("has exactly 256 inline creates and both FTS tables", async () => {
    const creates = fileNames.flatMap((name,) => {
      const source = readFileSync(path.join(MIGRATIONS_DIR, name,), "utf-8",);
      return [...source.matchAll(/\.createTable\("([^"]+)",\)/g,),].map((m,) => m[1]!);
    },);

    expect(creates.length,).toBe(256,);
    expect(new Set(creates,).size,).toBe(256,);
    expect([...SCHEMA.tableNames,].sort(),).toEqual([...creates,].sort(),);

    const sqlite = new Database(":memory:",);
    const db = new Kysely({ dialect: createSqliteDialect(sqlite,), },);
    try {
      await applyBaseline(db,);
      for (const fts of ["memories_fts", "messages_fts",]) {
        const row = sqlite.query(
          `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
        ).get(fts,) as { sql: string } | undefined;

        expect(canon(row?.sql ?? null,), fts,).toContain("CREATE VIRTUAL TABLE",);
      }
    } finally {
      await db.destroy();
    }
  });
});
