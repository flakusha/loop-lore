// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, sql, } from "kysely";
import { createLogger, } from "../logger";
import { createSqliteDialect, } from "./index";
import type { DB, } from "./schema";
import { runSchemaBackfill, } from "./schema-backfill";

describe("schema-backfill", () => {
  let db: Database;
  let kysely: Kysely<DB>;

  beforeEach(() => {
    createLogger({ level: "error", },);
    db = new Database(":memory:",);
    kysely = new Kysely<DB>({ dialect: createSqliteDialect(db,), },);
  },);

  afterEach(async () => {
    await kysely.destroy();
    db.close();
  },);

  test("no-ops when the legacy column is absent", async () => {
    await sql`CREATE TABLE chat_setup_templates (id TEXT PRIMARY KEY, gm_config TEXT)`.execute(kysely,);
    expect(await runSchemaBackfill(kysely,),).toBe(false,);
  });

  test("merges flags, drops the column, and re-runs clean", async () => {
    await sql`CREATE TABLE chat_setup_templates (id TEXT PRIMARY KEY, gm_config TEXT, visual_novel INTEGER)`.execute(
      kysely,
    );
    await sql`INSERT INTO chat_setup_templates (id, gm_config, visual_novel) VALUES
      ('vn-bare', NULL, 1),
      ('vn-merge', '{"mode":"solo"}', 1),
      ('flat', '{"mode":"solo"}', 0),
      ('odd', NULL, 2),
      ('unflagged', NULL, NULL)`.execute(kysely,);

    expect(await runSchemaBackfill(kysely,),).toBe(true,);

    const rows = await sql<
      { id: string; gm_config: string | null }
    >`SELECT id, gm_config FROM chat_setup_templates ORDER BY id`.execute(kysely,);
    const byId = new Map(rows.rows.map((row,) => [row.id, row.gm_config,]),);
    expect(JSON.parse(byId.get("vn-bare",) ?? "",),).toEqual({ renderingOverride: "visual_novel", },);
    expect(JSON.parse(byId.get("vn-merge",) ?? "",),).toEqual({ mode: "solo", renderingOverride: "visual_novel", },);
    expect(byId.get("flat",),).toBe('{"mode":"solo"}',);
    expect(byId.get("odd",),).toBeNull();
    expect(byId.get("unflagged",),).toBeNull();

    const columns = await sql<{ name: string }>`SELECT name FROM pragma_table_info('chat_setup_templates')`.execute(
      kysely,
    );
    expect(columns.rows.some((row,) => row.name === "visual_novel"),).toBe(false,);
    expect(await runSchemaBackfill(kysely,),).toBe(false,);
  });
});
