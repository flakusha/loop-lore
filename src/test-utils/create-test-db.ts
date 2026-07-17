import { Database } from "bun:sqlite";
import { Kysely } from "kysely";
import { createSqliteDialect } from "../db/index";
import type { DB } from "../db/schema";

/** Create an in-memory SQLite test database */
export function createTestDb(): Kysely<DB> {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL");
  const dialect = createSqliteDialect(sqlite);
  return new Kysely<DB>({ dialect });
}
