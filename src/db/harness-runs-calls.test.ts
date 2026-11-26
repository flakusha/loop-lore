// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Contract test for 018_harness_runs_calls, kept outside the migrations
 * directory so the migration-discovery regexes cannot import it as a
 * migration. The filename has no numeric prefix for the same reason.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";

import { createSqliteDialect, } from "./index";
import { down, up, } from "./migrations/018_harness_runs_calls";

interface ColumnInfo {
  name: string;
  type: string;
}

/** Names of the tables this migration owns, as seen by SQLite. */
function harnessTables(sqlite: Database,): string[] {
  const rows = sqlite.query(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name LIKE 'harness_%' ORDER BY name`,
  ).all() as { name: string }[];

  return rows.map((row,) => row.name);
}

describe("018_harness_runs_calls", () => {
  let raw: Database;
  let db: Kysely<unknown>;

  beforeEach(() => {
    raw = new Database(":memory:",);
    db = new Kysely<unknown>({ dialect: createSqliteDialect(raw,), },);
  },);

  afterEach(async () => {
    await db.destroy();
    raw.close();
  },);

  test("up creates both tables with the exec-log column contract", async () => {
    await up(db,);
    expect(harnessTables(raw,),).toEqual(["harness_calls", "harness_runs",],);

    const runs = raw.query("PRAGMA table_info('harness_runs')",).all() as ColumnInfo[];
    const calls = raw.query("PRAGMA table_info('harness_calls')",).all() as ColumnInfo[];
    const names = (columns: ColumnInfo[],) => columns.map((column,) => column.name);

    for (
      const column of [
        "id",
        "principal_id",
        "principal_kind",
        "status",
        "task",
        "task_type",
        "command",
        "model",
        "git_sha",
        "turn_id",
        "tokens_in",
        "tokens_out",
        "cost_usd",
        "latency_ms",
        "error_category",
        "started_at",
        "ended_at",
        "created_at",
      ]
    ) {
      expect(names(runs,), `harness_runs.${column}`,).toContain(column,);
    }

    for (
      const column of [
        "id",
        "run_id",
        "principal_id",
        "principal_kind",
        "status",
        "model",
        "tokens_in",
        "tokens_out",
        "cost_usd",
        "started_at",
        "ended_at",
      ]
    ) {
      expect(names(calls,), `harness_calls.${column}`,).toContain(column,);
    }

    // Status is a text vocabulary, never a boolean; cost NULL keeps the
    // exec log's "unknown price" meaning distinct from zero.
    expect(runs.find((column,) => column.name === "status")?.type.toLowerCase(),).toBe("text",);
    expect(calls.find((column,) => column.name === "status")?.type.toLowerCase(),).toBe("text",);
    expect(runs.find((column,) => column.name === "cost_usd")?.type.toLowerCase(),).toBe("real",);

    const foreignKeys = raw.query("PRAGMA foreign_key_list('harness_calls')",).all() as {
      table: string;
      from: string;
      to: string;
    }[];

    expect(foreignKeys,).toHaveLength(1,);
    expect(foreignKeys[0],).toMatchObject({ table: "harness_runs", from: "run_id", to: "id", },);
  });

  test("calls attribute to their parent run and survive a down/up roundtrip", async () => {
    await up(db,);
    raw.query(
      `INSERT INTO harness_runs
        (id, principal_id, principal_kind, status, task, task_type, git_sha, tokens_in, tokens_out, cost_usd, latency_ms, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("run-1", "u-1", "user", "ok", "review", "review", "abc123", 10, 5, null, 250, "2026-11-25T00:00:00Z",);

    for (const [id, status,] of [["call-1", "ok",], ["call-2", "timeout",],] as const) {
      raw.query(
        `INSERT INTO harness_calls (id, run_id, status, model, tokens_in, tokens_out, cost_usd, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, "run-1", status, "test-model", 5, 2, 0.001, "2026-11-25T00:00:01Z",);
    }

    expect(raw.query("SELECT count(*) AS n FROM harness_calls WHERE run_id = 'run-1'",).get(),)
      .toEqual({ n: 2, },);

    await down(db,);
    expect(harnessTables(raw,),).toEqual([],);

    await up(db,);
    expect(harnessTables(raw,),).toEqual(["harness_calls", "harness_runs",],);
    expect(raw.query("SELECT count(*) AS n FROM harness_runs",).get(),).toEqual({ n: 0, },);
  });

  test("status, principal kind and parent attribution reject bad writes", async () => {
    await up(db,);
    const insertRun = (id: string, principalKind: string, status: string,) =>
      raw.query(
        `INSERT INTO harness_runs (id, principal_kind, status, task, task_type, started_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, principalKind, status, "review", "review", "2026-11-25T00:00:00Z",);

    expect(() => insertRun("bad-status", "user", "bogus",)).toThrow(/CHECK constraint failed/,);
    expect(() => insertRun("bad-kind", "caller-supplied", "ok",)).toThrow(/CHECK constraint failed/,);
    insertRun("run-1", "internal-service", "ok",);

    expect(() =>
      raw.query(
        `INSERT INTO harness_calls (id, run_id, started_at) VALUES (?, ?, ?)`,
      ).run("orphan", "missing-run", "2026-11-25T00:00:00Z",)
    ).toThrow(/FOREIGN KEY constraint failed/,);
  });
});
