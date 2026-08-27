// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { apply, type Write, } from "./apply";
import type { AsyncStoreConfig, } from "./store";

/**
 * Minimal mock that satisfies the Kysely surface `apply()` actually uses:
 *   insertInto(...).values(...).onConflict(...).execute()
 *   updateTable(...).set(...).where(...).execute()
 *
 * The mock records the query shape so each test asserts the right column
 * was written for each `Write` variant without spinning up a real SQLite
 * instance.
 */

interface RecordedInsert {
  table: string;
  values: Record<string, unknown>;
  onConflict: boolean;
}

interface RecordedUpdate {
  table: string;
  set: Record<string, unknown>;
  where: { column: string; value: unknown };
}

interface RecordedQuery {
  insert?: RecordedInsert;
  update?: RecordedUpdate;
}

function makeMockDb(): {
  queries: RecordedQuery[];
  mock: Parameters<typeof apply>[0];
} {
  const queries: RecordedQuery[] = [];

  function insertChain(table: string,): unknown {
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

  function updateChain(table: string,): unknown {
    function set(set: Record<string, unknown>,): unknown {
      const q: RecordedQuery = {
        update: { table, set, where: { column: "", value: undefined, }, },
      };
      queries.push(q,);
      return {
        where(column: string, _op: string, value: unknown,): unknown {
          if (q.update) { q.update.where = { column, value, }; }
          return { execute: async (): Promise<void> => undefined, };
        },
      };
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

  test("progress updates status + JSON-stringified payload", async () => {
    const { queries, mock, } = makeMockDb();
    const write: Write = {
      kind: "progress",
      id: "r-2",
      status: "in_progress",
      progress: { step: "tokens", n: 42, },
    };
    await apply(mock, write, cfg,);
    expect(queries[0]?.update?.table,).toBe("request_results",);
    expect(queries[0]?.update?.set.status,).toBe("in_progress",);
    expect(queries[0]?.update?.set.progress,).toBe('{"step":"tokens","n":42}',);
    expect(queries[0]?.update?.where,).toEqual({ column: "id", value: "r-2", },);
  });

  test("progress with null payload writes null (not 'null')", async () => {
    const { queries, mock, } = makeMockDb();
    const write: Write = { kind: "progress", id: "r-x", status: "in_progress", progress: null, };
    await apply(mock, write, cfg,);
    expect(queries[0]?.update?.set.progress,).toBeNull();
  });

  test("complete inlines when body fits, JSON-stringifies headers, sets completed_at", async () => {
    const { queries, mock, } = makeMockDb();
    const write: Write = {
      kind: "complete",
      id: "r-3",
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
  });

  test("complete nulls response_body when body exceeds maxInlineBytes", async () => {
    const { queries, mock, } = makeMockDb();
    const write: Write = {
      kind: "complete",
      id: "r-4",
      response: { status: 200, headers: {}, body: "x".repeat(cfg.maxInlineBytes + 1,), },
    };
    await apply(mock, write, cfg,);
    expect(queries[0]?.update?.set.response_body,).toBeNull();
    expect(queries[0]?.update?.set.status,).toBe("complete",);
  });

  test("fail marks failed and records the error message", async () => {
    const { queries, mock, } = makeMockDb();
    const write: Write = { kind: "fail", id: "r-5", error: "boom", };
    await apply(mock, write, cfg,);
    expect(queries[0]?.update?.set.status,).toBe("failed",);
    expect(queries[0]?.update?.set.error,).toBe("boom",);
    expect(queries[0]?.update?.set.completed_at,).toMatch(/^\d{4}-\d{2}-\d{2}T/,);
    expect(queries[0]?.update?.where,).toEqual({ column: "id", value: "r-5", },);
  });
});
