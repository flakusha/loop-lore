// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Parallel-safe: per-test in-memory DB and injected worktree removal.
import { afterEach, beforeEach, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { AgentTokenScope, } from "../db/enums-core/agent-tokens";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertAgentTokens, insertRsiAgentWorktrees, } from "../test-utils/insert-helpers";
import { cleanupIdleWorktrees, MAX_WORKTREE_IDLE_MS, } from "./cleanup";

const NOW = 1_800_000_000_000;

let testDb: TestDb;
let db: Kysely<DB>;

beforeEach(async () => {
  createLogger({ level: "error", },);
  testDb = await createTestDb();
  db = testDb.db;
},);

afterEach(async () => {
  await destroyTestDb(testDb,);
},);

async function seedWorktree(): Promise<string> {
  const tokenId = await insertAgentTokens(db, `digest-${crypto.randomUUID()}`, AgentTokenScope.Worktree,);
  return insertRsiAgentWorktrees(db, tokenId, "feature/gc", "/fake/worktree", {
    id: crypto.randomUUID(),
    last_active_at: new Date(NOW - MAX_WORKTREE_IDLE_MS - 1_000,).toISOString(),
    disk_bytes: 0,
  },);
}

test("a collected worktree writes one audit row", async () => {
  const worktreeId = await seedWorktree();
  const removed: string[] = [];

  const count = await cleanupIdleWorktrees({
    database: db,
    removeWorktree: async ({ path, },) => {
      removed.push(path,);
    },
    nowMs: () => NOW,
  },);

  expect(count,).toBe(1,);
  expect(removed,).toEqual(["/fake/worktree",],);

  const row = await db.selectFrom("rsi_agent_worktrees",)
    .select("removed_at",)
    .where("id", "=", worktreeId,)
    .executeTakeFirst();

  expect(row?.removed_at,).not.toBeNull();

  const actions = await db.selectFrom("agent_actions",)
    .selectAll()
    .where("action", "=", "worktree_gc",)
    .execute();

  expect(actions,).toHaveLength(1,);
  expect(actions[0]?.worktree_id,).toBe(worktreeId,);
  expect(actions[0]?.result,).toBe("removed",);
  expect(actions[0]?.token_digest,).toBe("none",);
  expect(actions[0]?.metadata,).toBe('{"idle":true,"oversize":false}',);
});

test("a failed removal leaves no audit row", async () => {
  await seedWorktree();

  const count = await cleanupIdleWorktrees({
    database: db,
    removeWorktree: async () => {
      throw new Error("busy",);
    },
    nowMs: () => NOW,
  },);

  expect(count,).toBe(0,);
  const actions = await db.selectFrom("agent_actions",)
    .selectAll()
    .where("action", "=", "worktree_gc",)
    .execute();

  expect(actions,).toHaveLength(0,);
});
