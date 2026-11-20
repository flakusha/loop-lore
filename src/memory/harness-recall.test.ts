// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness recall tests (TASK-harness-memory-scope-for-exec-log-recall):
 * run summaries embed as harness-scoped memories and recall only in the
 * chat they were formed in — no cross-chat leakage.
 *
 * Resource contract: ONE in-memory migrated DB per test (its own
 * user/actor/chat ids), no child process, no ports, no cross-test state.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { buildRunRecord, } from "../harness/exec-recorder";
import type { HarnessRunRecord, } from "../harness/types";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertActors, } from "../test-utils/insert-helpers";
import {
  buildHarnessMemoryPrefix,
  formatExecRunSummary,
  MAX_HARNESS_RECALL,
  recallHarnessMemories,
  storeHarnessRunSummary,
} from "./harness-recall";

let fixture: TestDb;
const userId = "user-harness-recall";
const actorId = "actor-harness-recall";
const chatA = "chat-harness-a";
const chatB = "chat-harness-b";

/** Minimal finished-run record for the memory store. */
function runRecord(overrides: Partial<HarnessRunRecord> = {},): HarnessRunRecord {
  return buildRunRecord({
    taskType: "harness",
    model: "zai/flash",
    runMs: 12,
    result: "ok",
    task: "do the thing",
    profile: "omp",
    ...overrides,
  },);
}

beforeEach(async () => {
  fixture = await createTestDb();
  await fixture.db.insertInto("users",).values({
    id: userId,
    username: "harness-recall",
    display_name: "Harness Recall",
    role: "solo",
    status: "active",
    settings: "{}",
  },).execute();

  await insertActors(fixture.db, "Recall Actor", {
    id: actorId,
    actor_type: "character",
    owner_id: userId,
    agent_type: "ai",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
  } as never,);

  for (const chatId of [chatA, chatB,]) {
    await fixture.db.insertInto("chats",).values({
      id: chatId,
      name: `Harness Recall ${chatId}`,
      type: "direct",
      mode: "direct",
      created_by: userId,
      max_turns: null,
    } as never,).execute();
  }
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

describe("harness recall", () => {
  it("formats a one-line summary naming profile and result", () => {
    const summary = formatExecRunSummary(runRecord(),);
    expect(summary,).toContain("harness omp run ok",);
    expect(summary.includes("\n",),).toBe(false,);
  });

  it("stores a run summary and recalls it in the same chat", async () => {
    const id = await storeHarnessRunSummary(fixture.db, actorId, chatA, runRecord(),);
    expect(id,).not.toBeNull();

    const recalled = await recallHarnessMemories(fixture.db, actorId, chatA,);
    expect(recalled,).toHaveLength(1,);
    expect(recalled[0]?.scope,).toBe("harness",);
    expect(recalled[0]?.sourceChatId,).toBe(chatA,);

    const prefix = buildHarnessMemoryPrefix(recalled,);
    expect(prefix,).toContain("<prior-harness-runs>",);
    expect(prefix,).toContain(recalled[0]?.content ?? "",);
  });

  it("never leaks summaries into another chat", async () => {
    await storeHarnessRunSummary(fixture.db, actorId, chatA, runRecord(),);

    const recalled = await recallHarnessMemories(fixture.db, actorId, chatB,);
    expect(recalled,).toEqual([],);
    expect(buildHarnessMemoryPrefix(recalled,),).toBe("",);
  });

  it("caps default recall at MAX_HARNESS_RECALL, newest first", async () => {
    for (let i = 0; i < MAX_HARNESS_RECALL + 1; i++) {
      const stored = await storeHarnessRunSummary(fixture.db, actorId, chatA, runRecord({ task: `task-${i}`, },),);
      expect(stored,).not.toBeNull();
    }

    const recalled = await recallHarnessMemories(fixture.db, actorId, chatA,);
    expect(recalled,).toHaveLength(MAX_HARNESS_RECALL,);
  });

  it("dedupes an identical summary instead of storing twice", async () => {
    const record = runRecord();
    const first = await storeHarnessRunSummary(fixture.db, actorId, chatA, record,);
    const second = await storeHarnessRunSummary(fixture.db, actorId, chatA, record,);
    expect(first,).not.toBeNull();
    expect(second,).toBe(first,);
    expect(await recallHarnessMemories(fixture.db, actorId, chatA,),).toHaveLength(1,);
  });
});
