// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { rmSync, } from "node:fs";
import { apply, type Write, } from "./apply";
import { readOffloadedBody, } from "./offload";
import type { AsyncStoreConfig, } from "./store";

/**
 * Minimal mock that satisfies the Kysely surface `apply()` actually uses:
 *   insertInto(...).values(...).onConflict(...).execute()
 *   updateTable(...).set(...).where(...).where(...).execute()
 *
 * The mock records the query shape so each test asserts the right columns
 * were written for each `Write` variant without spinning up a real SQLite
 * instance.
 *
 * BUG-bug-async-lifecycle-writes-request-results-unscoped-by-user added
 * a second `.where("user_id", ...)` to scope updates by owner — the
 * mock's `where()` returns a builder that exposes BOTH `where` (for
 * chaining) AND `execute` (for the terminal call).
 */

interface RecordedInsert {
  table: string;
  values: Record<string, unknown>;
  onConflict: boolean;
}

interface RecordedUpdate {
  table: string;
  set: Record<string, unknown>;
  /** Last `where()` recorded. Multi-where chains collapse to the latest
   * match per Kysely semantics (each `where` AND-combines into the WHERE
   * clause; only the last call's column/value is asserted here). */
  where: { column: string; value: unknown };
  /** All `where()` calls in order — used to assert user-scope chaining. */
  whereCalls: Array<{ column: string; value: unknown }>;
}

interface RecordedQuery {
  insert?: RecordedInsert;
  update?: RecordedUpdate;
}

/**
 * A Kysely-shaped update chain that supports `where().where().execute()`.
 * Each `.where()` returns a fresh builder (recording into the same `q`)
 * so production code that chains scopes works the same as in tests.
 */
interface UpdateBuilderMock {
  where: (column: string, op: string, value: unknown,) => UpdateBuilderMock;
  execute: () => Promise<void>;
}

/** */
function makeMockDb(): {
  queries: RecordedQuery[];
  mock: Parameters<typeof apply>[0];
} {
  const queries: RecordedQuery[] = [];

  /**
   * @param table
   */
  function insertChain(table: string,): unknown {
    /**
     * @param values
     */
    function values(values: Record<string, unknown>,): unknown {
      const q: RecordedQuery = {
        insert: { table, values, onConflict: false, },
      };
      queries.push(q,);
      return {
        onConflict(
          cb: (oc: { column: (n: string,) => { doNothing: () => unknown } },) => unknown,
        ): unknown {
          // Invoke the callback to prove the dialect is honored; the mock
          // does not enforce constraints.
          cb({ column: () => ({ doNothing: () => undefined, }), },);
          if (q.insert) { q.insert.onConflict = true; }
          return { execute: async (): Promise<void> => undefined, };
        },
        execute: async (): Promise<void> => undefined,
      };
    }
    return { values, };
  }

  /**
   * @param table
   */
  function updateChain(table: string,): unknown {
    /**
     * @param set
     */
    function set(set: Record<string, unknown>,): unknown {
      const q: RecordedQuery = {
        update: { table, set, where: { column: "", value: undefined, }, whereCalls: [], },
      };
      queries.push(q,);
      const builder: UpdateBuilderMock = {
        where(column: string, _op: string, value: unknown,): UpdateBuilderMock {
          if (q.update) {
            q.update.where = { column, value, };
            q.update.whereCalls.push({ column, value, },);
          }
          // Return `this` so production code can chain a second `.where()`
          // (e.g. `where("id", ...).where("user_id", ...)`). Mirrors Kysely.
          return builder;
        },
        execute: async (): Promise<void> => undefined,
      };
      return builder;
    }
    return { set, };
  }

  return {
    queries,
    mock: {
      insertInto: insertChain,
      updateTable: updateChain,
    } as Parameters<typeof apply>[0],
  };
}

const cfg: Required<AsyncStoreConfig> = {
  maxInlineBytes: 1024,
  defaultTtlMs: 60_000,
  queueLimit: 1000,
};

describe("apply()", () => {
  test("upsert writes a pending row with onConflict.doNothing", async () => {
    const { queries, mock, } = makeMockDb();
    const write: Write = {
      kind: "upsert",
      id: "r-1",
      method: "POST",
      routePattern: "/api/x",
      userId: "alice",
      startedAt: "2026-08-27T00:00:00Z",
    };
    await apply(mock, write, cfg,);
    expect(queries,).toHaveLength(1,);
    expect(queries[0]?.insert?.table,).toBe("request_results",);
    expect(queries[0]?.insert?.onConflict,).toBe(true,);
    expect(queries[0]?.insert?.values.status,).toBe("pending",);
    expect(queries[0]?.insert?.values.id,).toBe("r-1",);
    expect(queries[0]?.insert?.values.method,).toBe("POST",);
    expect(queries[0]?.insert?.values.route_pattern,).toBe("/api/x",);
    expect(queries[0]?.insert?.values.user_id,).toBe("alice",);
    expect(queries[0]?.insert?.values.started_at,).toBe("2026-08-27T00:00:00Z",);
  });

  test("progress scopes update by user_id when authenticated", async () => {
    const { queries, mock, } = makeMockDb();
    const write: Write = {
      kind: "progress",
      id: "r-2",
      userId: "alice",
      status: "in_progress",
      progress: { step: "tokens", n: 42, },
    };
    await apply(mock, write, cfg,);
    expect(queries[0]?.update?.table,).toBe("request_results",);
    expect(queries[0]?.update?.set.status,).toBe("in_progress",);
    expect(queries[0]?.update?.set.progress,).toBe('{"step":"tokens","n":42}',);
    // Authenticated writes scope by (id, user_id) — verify both WHERE clauses.
    expect(queries[0]?.update?.whereCalls,).toEqual([
      { column: "id", value: "r-2", },
      { column: "user_id", value: "alice", },
    ],);
  });

  test("progress with null userId only matches id (anonymous bucket)", async () => {
    const { queries, mock, } = makeMockDb();
    const write: Write = { kind: "progress", id: "r-x", userId: null, status: "in_progress", progress: null, };
    await apply(mock, write, cfg,);
    expect(queries[0]?.update?.set.progress,).toBeNull();
    // Anonymous writes must NOT scope by user_id — otherwise SQL NULL = NULL
    // is false and we silently drop the update. Only `id` is included.
    expect(queries[0]?.update?.whereCalls,).toEqual([
      { column: "id", value: "r-x", },
    ],);
  });

  test("progress with null payload writes null (not 'null')", async () => {
    const { queries, mock, } = makeMockDb();
    const write: Write = { kind: "progress", id: "r-x", userId: "alice", status: "in_progress", progress: null, };
    await apply(mock, write, cfg,);
    expect(queries[0]?.update?.set.progress,).toBeNull();
  });

  test("complete inlines when body fits, JSON-stringifies headers, sets completed_at + scopes by user", async () => {
    const { queries, mock, } = makeMockDb();
    const write: Write = {
      kind: "complete",
      id: "r-3",
      userId: "alice",
      response: {
        status: 201,
        headers: { "content-type": "application/json", "x-trace": "t", },
        body: "ok",
      },
    };
    await apply(mock, write, cfg,);
    expect(queries[0]?.update?.set.status,).toBe("complete",);
    expect(queries[0]?.update?.set.response_status,).toBe(201,);
    expect(queries[0]?.update?.set.response_headers,).toBe('{"content-type":"application/json","x-trace":"t"}',);
    expect(queries[0]?.update?.set.response_body,).toBe("ok",);
    expect(queries[0]?.update?.set.completed_at,).toMatch(/^\d{4}-\d{2}-\d{2}T/,);
    expect(queries[0]?.update?.whereCalls,).toEqual([
      { column: "id", value: "r-3", },
      { column: "user_id", value: "alice", },
    ],);
  });

  test("complete spills body over maxInlineBytes to disk (recoverable, not lost)", async () => {
    const { queries, mock, } = makeMockDb();
    const bigBody = "x".repeat(cfg.maxInlineBytes + 1,);
    const write: Write = {
      kind: "complete",
      id: "r-4",
      userId: "alice",
      response: { status: 200, headers: {}, body: bigBody, },
    };
    await apply(mock, write, cfg,);
    const set = queries[0]?.update?.set;
    // The inline column is nulled (the daemon would otherwise skip it), but
    // the body is NOT lost — it is spilled to disk and the path recorded so
    // the status endpoint can read it back. BUG-bug-async-store-complete-drops-response-body-larger-than-max.
    expect(set?.response_body,).toBeNull();
    expect(set?.status,).toBe("complete",);
    expect(set?.offload_path,).toBeTypeOf("string",);
    expect(set?.offloaded_at,).toMatch(/^\d{4}-\d{2}-\d{2}T/,);
    // The round-trip is the real contract: read the spilled file back.
    try {
      const restored = readOffloadedBody(set?.offload_path as string,);
      expect(restored,).toBe(bigBody,);
    } finally {
      // Remove the spill file so this test does not pollute OFFLOAD_DIR.
      rmSync(set?.offload_path as string, { force: true, },);
    }
  });

  test("fail scopes update by user_id when authenticated", async () => {
    const { queries, mock, } = makeMockDb();
    const write: Write = { kind: "fail", id: "r-5", userId: "alice", error: "boom", };
    await apply(mock, write, cfg,);
    expect(queries[0]?.update?.set.status,).toBe("failed",);
    expect(queries[0]?.update?.set.error,).toBe("boom",);
    expect(queries[0]?.update?.set.completed_at,).toMatch(/^\d{4}-\d{2}-\d{2}T/,);
    expect(queries[0]?.update?.whereCalls,).toEqual([
      { column: "id", value: "r-5", },
      { column: "user_id", value: "alice", },
    ],);
  });

  test("fail with null userId only matches id (anonymous bucket)", async () => {
    const { queries, mock, } = makeMockDb();
    const write: Write = { kind: "fail", id: "r-anon", userId: null, error: "x", };
    await apply(mock, write, cfg,);
    expect(queries[0]?.update?.whereCalls,).toEqual([
      { column: "id", value: "r-anon", },
    ],);
  });

  test("BUG-table-backend-request-id-collision: cross-user complete cannot overwrite owner row", async () => {
    const { queries, mock, } = makeMockDb();
    await apply(mock, {
      kind: "upsert",
      id: "r-shared",
      method: "POST",
      routePattern: "/api/x",
      userId: "alice",
      startedAt: "2026-09-03T00:00:00Z",
    }, cfg,);
    await apply(mock, {
      kind: "upsert",
      id: "r-shared",
      method: "POST",
      routePattern: "/api/x",
      userId: "bob",
      startedAt: "2026-09-03T00:00:01Z",
    }, cfg,);
    expect(queries[0]?.insert?.values.user_id,).toBe("alice",);
    expect(queries[1]?.insert?.values.user_id,).toBe("bob",);
    expect(queries[0]?.insert?.onConflict,).toBe(true,);
    expect(queries[1]?.insert?.onConflict,).toBe(true,);
    await apply(mock, {
      kind: "complete",
      id: "r-shared",
      userId: "bob",
      response: { status: 200, headers: {}, body: "bob-body-leak", },
    }, cfg,);
    const bUpdate = queries[2]?.update;
    expect(bUpdate,).toBeDefined();
    expect(bUpdate?.whereCalls,).toEqual([{ column: "id", value: "r-shared", }, {
      column: "user_id",
      value: "bob",
    },],);
    expect(bUpdate?.set.response_body,).toBe("bob-body-leak",);
    expect(bUpdate?.set.status,).toBe("complete",);
  });
});
