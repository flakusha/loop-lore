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

  test("no-ops on a converged database", async () => {
    await sql`CREATE TABLE chat_setup_templates (id TEXT PRIMARY KEY, gm_config TEXT)`.execute(kysely,);
    await sql`CREATE VIRTUAL TABLE memories_fts USING fts5(memory_id UNINDEXED, content)`.execute(kysely,);
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
  });

  test("rebuilds a broken-shape memories_fts with triggers and backfill", async () => {
    await sql`CREATE TABLE chat_setup_templates (id TEXT PRIMARY KEY, gm_config TEXT)`.execute(kysely,);
    await sql`CREATE TABLE actor_memories (id TEXT PRIMARY KEY, content TEXT)`.execute(kysely,);
    await sql`INSERT INTO actor_memories (id, content) VALUES ('m1', 'the tavern keeper hides a brass key')`.execute(
      kysely,
    );
    await sql`CREATE VIRTUAL TABLE memories_fts USING fts5(
      memory_id UNINDEXED,
      content,
      content_rowid='memory_id'
    )`.execute(kysely,);

    expect(await runSchemaBackfill(kysely,),).toBe(true,);

    const ddl = await sql<{ sql: string }>`SELECT sql FROM sqlite_master WHERE name = 'memories_fts'`.execute(kysely,);
    expect(ddl.rows[0]?.sql.includes("content_rowid",),).toBe(false,);

    const triggers = await sql<
      { name: string }
    >`SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'actor_memories_fts_%'`.execute(kysely,);
    expect(triggers.rows,).toHaveLength(3,);

    const hits = await sql<{ memory_id: string }>`SELECT memory_id FROM memories_fts WHERE memories_fts MATCH 'brass'`
      .execute(kysely,);
    expect(hits.rows.map((row,) => row.memory_id),).toEqual(["m1",],);

    await sql`INSERT INTO actor_memories (id, content) VALUES ('m2', 'a clockwork owl watches silently')`.execute(
      kysely,
    );
    const live = await sql<
      { memory_id: string }
    >`SELECT memory_id FROM memories_fts WHERE memories_fts MATCH 'clockwork'`.execute(kysely,);
    expect(live.rows.map((row,) => row.memory_id),).toEqual(["m2",],);

    expect(await runSchemaBackfill(kysely,),).toBe(false,);
  });

  test("rebuilds a missing memories_fts and skips backfill without actor_memories", async () => {
    await sql`CREATE TABLE chat_setup_templates (id TEXT PRIMARY KEY, gm_config TEXT)`.execute(kysely,);

    expect(await runSchemaBackfill(kysely,),).toBe(true,);

    const ddl = await sql<{ sql: string }>`SELECT sql FROM sqlite_master WHERE name = 'memories_fts'`.execute(kysely,);
    expect(ddl.rows[0]?.sql.includes("content_rowid",),).toBe(false,);
    const count = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM memories_fts`.execute(kysely,);
    expect(count.rows[0]?.n,).toBe(0,);
  });
});
