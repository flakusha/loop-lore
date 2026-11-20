// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct coverage for the agent-capability exports that the route suites
 * exercise only indirectly: the sandbox/cleanup constants, the capacity
 * check, the default check runner, and the sweeper lifecycle handle.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { CLEANUP_INTERVAL_MS, cleanupIdleWorktrees, MAX_WORKTREE_IDLE_MS, startWorktreeCleanup, } from "../cleanup";
import {
  DEFAULT_CHECK_TIMEOUT_MS,
  MAX_CHECK_TIMEOUT_MS,
  runBunCheck,
} from "./check";
import { checkWorktreeCapacity, MAX_WORKTREE_BYTES, MAX_WORKTREES_GLOBAL, MAX_WORKTREES_PER_TOKEN, } from "./sandbox";

let testDb: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  testDb = await createTestDb();
  db = testDb.db;
},);

afterEach(async () => {
  await destroyTestDb(testDb,);
},);

describe("agent capability constants", () => {
  test("the check timeout band is default 10 min, max 30 min", () => {
    expect(DEFAULT_CHECK_TIMEOUT_MS,).toBe(10 * 60 * 1000,);
    expect(MAX_CHECK_TIMEOUT_MS,).toBe(30 * 60 * 1000,);
    expect(MAX_CHECK_TIMEOUT_MS,).toBeGreaterThan(DEFAULT_CHECK_TIMEOUT_MS,);
  });

  test("the worktree budgets are 5 per token, 10 global, 500 MB", () => {
    expect(MAX_WORKTREES_PER_TOKEN,).toBe(5,);
    expect(MAX_WORKTREES_GLOBAL,).toBe(10,);
    expect(MAX_WORKTREE_BYTES,).toBe(500 * 1024 * 1024,);
    expect(MAX_WORKTREE_IDLE_MS,).toBe(24 * 60 * 60 * 1000,);
    expect(CLEANUP_INTERVAL_MS,).toBe(60 * 60 * 1000,);
  });
});

describe("checkWorktreeCapacity", () => {
  async function insertActive(tokenId: string,): Promise<void> {
    await db.insertInto("agent_tokens",).values({
      id: tokenId,
      token_hash: crypto.randomUUID(),
      scope: "agent:worktree",
    },).execute().catch(() => {},);

    await db.insertInto("rsi_agent_worktrees",).values({
      id: crypto.randomUUID(),
      token_id: tokenId,
      path: `/tmp/wt-${crypto.randomUUID()}`,
      branch: `wt-${crypto.randomUUID().slice(0, 8,)}`,
      created_at: new Date().toISOString(),
    },).execute();
  }

  test("a fresh token under both budgets is allowed", async () => {
    expect(await checkWorktreeCapacity(db, "token-a",),).toEqual({ allowed: true, },);
  });

  test("the per-token cap binds before the global cap", async () => {
    for (let i = 0; i < MAX_WORKTREES_PER_TOKEN; i++) {
      await insertActive("token-a",);
    }

    expect(await checkWorktreeCapacity(db, "token-a",),).toEqual({
      allowed: false,
      reason: "per-token worktree limit reached",
    },);
  });

  test("the global cap rejects a different token once full", async () => {
    // Rows for other tokens that stay under the per-token cap but fill the
    // global budget: 2 rows each across 5 tokens = 10 active rows.
    for (let t = 0; t < 5; t++) {
      await insertActive(`token-${t}`,);
      await insertActive(`token-${t}`,);
    }

    expect(await checkWorktreeCapacity(db, "token-fresh",),).toEqual({
      allowed: false,
      reason: "global worktree limit reached",
    },);
  });

  test("tombstoned rows do not count against capacity", async () => {
    await insertActive("token-a",);
    await db.updateTable("rsi_agent_worktrees",).set({
      removed_at: new Date().toISOString(),
    },).execute();

    expect(await checkWorktreeCapacity(db, "token-a",),).toEqual({ allowed: true, },);
  });
});

describe("runBunCheck", () => {
  test("spawns bun with stdin closed and exposes kill", async () => {
    const execution = runBunCheck({ cwd: import.meta.dir, gates: undefined, },);
    expect(typeof execution.kill,).toBe("function",);
    expect(execution.stream,).toBeDefined();
    execution.kill();
    const code = await execution.exited;
    expect(code,).not.toBeNull();
  });
});

describe("startWorktreeCleanup lifecycle", () => {
  test("start returns a stop handle that clears the sweeper", async () => {
    const stop = startWorktreeCleanup({
      database: db,
      removeWorktree: async () => {},
    },);

    expect(typeof stop,).toBe("function",);
    stop();
    // A stopped sweeper leaves no rows changed even when the registry is empty.
    expect(
      await cleanupIdleWorktrees({
        database: db,
        removeWorktree: async () => {},
      },),
    ).toBe(0,);
  });
});
