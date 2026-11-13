// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * queue-store.ts contract tests: the harness turn queue's row lifecycle —
 * enqueue (the store's own insert path, the one `queue.ts` calls), claim,
 * complete/fail/cancel, boot recovery, and the read verbs.
 *
 * Resource contract (parallel-safe): one :memory: SQLite per test via
 * createTestDb/destroyTestDb; no ports, no env, no sleeps.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { HarnessQueueErrorCode, HarnessQueueTurnStatus, } from "../../db/enums";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import {
  cancelQueuedTurn,
  claimNextQueuedTurn,
  completeQueuedTurn,
  failQueuedTurn,
  getQueuedTurn,
  type InsertQueuedTurn,
  insertQueuedTurns,
  listQueuedTurns,
  type QueuedTurnRow,
  recoverInterruptedTurns,
} from "./queue-store";

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-02T00:00:00.000Z";
const T2 = "2026-01-03T00:00:00.000Z";
const T3 = "2026-01-04T00:00:00.000Z";

let fixture: TestDb;
let db: TestDb["db"];
let userId: string;
let actorId: string;
let chatId: string;
let tagCounter = 0;

beforeEach(async () => {
  const tag = `qs${++tagCounter}`;
  userId = `user-queue-store-${tag}`;
  actorId = `actor-queue-store-${tag}`;
  chatId = `chat-queue-store-${tag}`;
  fixture = await createTestDb();
  db = fixture.db;

  // FK targets for the queue rows (chats.id / actors.id / users.id).
  await db.insertInto("users",).values({
    id: userId,
    username: `queue-store-${tag}`,
    display_name: "Queue Store",
    role: "solo",
    status: "active",
    settings: "{}",
  },).execute();

  await insertActors(db, "Alice", {
    id: actorId,
    actor_type: "character",
    owner_id: userId,
    agent_type: "ai",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
  } as never,);

  await db.insertInto("chats",).values({
    id: chatId,
    name: "Queue Store",
    type: "direct",
    mode: "direct",
    created_by: userId,
    max_turns: null,
  } as never,).execute();
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

/** An enqueue-time insert pointing at this test's chat fixture. */
function turn(id: string, opts: Partial<InsertQueuedTurn> = {},): InsertQueuedTurn {
  return {
    id,
    batchId: `batch-${id}`,
    profile: "omp",
    prompt: `prompt-${id}`,
    chatId,
    actorId,
    requestedBy: userId,
    requestedRole: "admin",
    createdAt: T0,
    ...opts,
  };
}

/** The full queued row shape, for exact-shape assertions. */
function queuedRow(id: string, createdAt = T0,): QueuedTurnRow {
  return {
    id,
    batch_id: `batch-${id}`,
    profile: "omp",
    prompt: `prompt-${id}`,
    status: HarnessQueueTurnStatus.Queued,
    chat_id: chatId,
    actor_id: actorId,
    requested_by: userId,
    requested_role: "admin",
    turn_key: null,
    attempts: 0,
    result_message_id: null,
    error_code: null,
    error_message: null,
    created_at: createdAt,
    started_at: null,
    finished_at: null,
  };
}

describe("insertQueuedTurns + getQueuedTurn", () => {
  it("persists a batch as queued rows with the insert's fields", async () => {
    await insertQueuedTurns(db, [
      turn("t1",),
      turn("t2", { profile: "opencode", requestedRole: null, turnKey: "key-1", createdAt: T1, },),
    ],);

    expect(await getQueuedTurn(db, "t1",),).toEqual(queuedRow("t1",),);

    const second = await getQueuedTurn(db, "t2",);
    expect(second?.profile,).toBe("opencode",);
    expect(second?.requested_role,).toBeNull();
    expect(second?.turn_key,).toBe("key-1",);
    expect(second?.created_at,).toBe(T1,);
  });

  it("getQueuedTurn returns null for an unknown id", async () => {
    expect(await getQueuedTurn(db, "missing",),).toBeNull();
  });
});

describe("claimNextQueuedTurn", () => {
  it("claims the oldest queued row and marks it running with attempts bumped", async () => {
    await insertQueuedTurns(db, [
      turn("t-old", { createdAt: T0, },),
      turn("t-new", { createdAt: T1, },),
    ],);

    const claimed = await claimNextQueuedTurn(db, [], T2,);
    expect(claimed?.id,).toBe("t-old",);
    expect(claimed?.status,).toBe(HarnessQueueTurnStatus.Running,);
    expect(claimed?.started_at,).toBe(T2,);
    expect(claimed?.attempts,).toBe(1,);

    // The persisted row moved with the returned projection.
    const persisted = await getQueuedTurn(db, "t-old",);
    expect(persisted?.status,).toBe(HarnessQueueTurnStatus.Running,);
    expect(persisted?.started_at,).toBe(T2,);
    expect(persisted?.attempts,).toBe(1,);
  });

  it("breaks same-timestamp ties by id", async () => {
    await insertQueuedTurns(db, [turn("t-b",), turn("t-a",),],);
    expect((await claimNextQueuedTurn(db, [], T2,))?.id,).toBe("t-a",);
  });

  it("returns null on an empty queue", async () => {
    expect(await claimNextQueuedTurn(db, [], T2,),).toBeNull();
  });

  it("skips queued rows whose profile already has a turn in flight", async () => {
    await insertQueuedTurns(db, [
      turn("t-busy", { createdAt: T0, },),
      turn("t-free", { profile: "opencode", createdAt: T1, },),
    ],);

    expect((await claimNextQueuedTurn(db, ["omp",], T2,))?.id,).toBe("t-free",);
  });

  it("returns null and mutates nothing when every queued profile is busy", async () => {
    await insertQueuedTurns(db, [turn("t1",),],);
    expect(await claimNextQueuedTurn(db, ["omp",], T2,),).toBeNull();
    expect(await getQueuedTurn(db, "t1",),).toEqual(queuedRow("t1",),);
  });

  it("cannot claim the same row twice", async () => {
    await insertQueuedTurns(db, [turn("t1",),],);
    expect(await claimNextQueuedTurn(db, [], T2,),).not.toBeNull();
    expect(await claimNextQueuedTurn(db, [], T3,),).toBeNull();
  });
});

describe("completeQueuedTurn / failQueuedTurn", () => {
  it("completes a turn with the assistant row it produced", async () => {
    await insertQueuedTurns(db, [turn("t1",),],);
    await completeQueuedTurn(db, "t1", { resultMessageId: "msg-9", finishedAt: T2, },);

    const row = await getQueuedTurn(db, "t1",);
    expect(row?.status,).toBe(HarnessQueueTurnStatus.Completed,);
    expect(row?.result_message_id,).toBe("msg-9",);
    expect(row?.finished_at,).toBe(T2,);
    expect(row?.error_code,).toBeNull();
  });

  it("fails a turn with the closed refusal vocabulary", async () => {
    await insertQueuedTurns(db, [turn("t1",),],);
    await failQueuedTurn(db, "t1", {
      errorCode: HarnessQueueErrorCode.RoleDenied,
      errorMessage: "role denied by the gate",
      finishedAt: T2,
    },);

    const row = await getQueuedTurn(db, "t1",);
    expect(row?.status,).toBe(HarnessQueueTurnStatus.Failed,);
    expect(row?.error_code,).toBe(HarnessQueueErrorCode.RoleDenied,);
    expect(row?.error_message,).toBe("role denied by the gate",);
    expect(row?.finished_at,).toBe(T2,);
    expect(row?.result_message_id,).toBeNull();
  });

  it("leave unknown ids untouched and do not throw", async () => {
    await insertQueuedTurns(db, [turn("t1",),],);
    await completeQueuedTurn(db, "ghost", { resultMessageId: "m", finishedAt: T2, },);
    await failQueuedTurn(db, "ghost", {
      errorCode: HarnessQueueErrorCode.TurnFailed,
      errorMessage: "e",
      finishedAt: T2,
    },);

    expect(await getQueuedTurn(db, "t1",),).toEqual(queuedRow("t1",),);
  });
});

describe("cancelQueuedTurn", () => {
  it("moves a queued turn to cancelled and reports 1", async () => {
    await insertQueuedTurns(db, [turn("t1",),],);
    expect(await cancelQueuedTurn(db, "t1", T2,),).toBe(1,);

    const row = await getQueuedTurn(db, "t1",);
    expect(row?.status,).toBe(HarnessQueueTurnStatus.Cancelled,);
    expect(row?.finished_at,).toBe(T2,);
  });

  it("refuses a running turn (no interrupt seam) and reports 0", async () => {
    await insertQueuedTurns(db, [turn("t1",),],);
    await claimNextQueuedTurn(db, [], T2,);
    expect(await cancelQueuedTurn(db, "t1", T3,),).toBe(0,);
    expect((await getQueuedTurn(db, "t1",))?.status,).toBe(HarnessQueueTurnStatus.Running,);
  });

  it("is idempotent and reports 0 for cancelled or unknown ids", async () => {
    await insertQueuedTurns(db, [turn("t1",),],);
    expect(await cancelQueuedTurn(db, "t1", T2,),).toBe(1,);
    expect(await cancelQueuedTurn(db, "t1", T3,),).toBe(0,);
    expect(await cancelQueuedTurn(db, "ghost", T3,),).toBe(0,);
    expect((await getQueuedTurn(db, "t1",))?.finished_at,).toBe(T2,);
  });
});

describe("recoverInterruptedTurns", () => {
  it("fails every running row interrupted and reports the count", async () => {
    await insertQueuedTurns(db, [
      turn("t1", { createdAt: T0, },),
      turn("t2", { createdAt: T1, },),
    ],);

    await claimNextQueuedTurn(db, [], T2,);
    await claimNextQueuedTurn(db, [], T2,);
    await insertQueuedTurns(db, [turn("t3", { createdAt: T1, },),],);

    expect(await recoverInterruptedTurns(db, T3,),).toBe(2,);

    const recovered = await getQueuedTurn(db, "t1",);
    expect(recovered?.status,).toBe(HarnessQueueTurnStatus.Failed,);
    expect(recovered?.error_code,).toBe(HarnessQueueErrorCode.Interrupted,);
    expect(recovered?.error_message,).toContain("process died",);
    expect(recovered?.finished_at,).toBe(T3,);

    // Queued work is untouched — only mid-flight turns were killed.
    expect((await getQueuedTurn(db, "t3",))?.status,).toBe(HarnessQueueTurnStatus.Queued,);
  });

  it("returns 0 when nothing was running", async () => {
    await insertQueuedTurns(db, [turn("t1",),],);
    expect(await recoverInterruptedTurns(db, T3,),).toBe(0,);
    expect((await getQueuedTurn(db, "t1",))?.status,).toBe(HarnessQueueTurnStatus.Queued,);
  });
});

describe("listQueuedTurns", () => {
  it("lists newest first (created_at desc, then id desc)", async () => {
    await insertQueuedTurns(db, [
      turn("t1", { createdAt: T0, },),
      turn("t2", { createdAt: T2, },),
      turn("t3", { createdAt: T1, },),
      turn("t4", { createdAt: T1, },),
    ],);

    expect((await listQueuedTurns(db,)).map((row,) => row.id),).toEqual(["t2", "t4", "t3", "t1",],);
  });

  it("filters by batch", async () => {
    await insertQueuedTurns(db, [turn("t1",), turn("t2",),],);
    const batchId = (await getQueuedTurn(db, "t1",))?.batch_id as string;

    expect((await listQueuedTurns(db, { batchId, },)).map((row,) => row.id),).toEqual(["t1",],);
  });

  it("bounds the page", async () => {
    await insertQueuedTurns(db, [
      turn("t1", { createdAt: T0, },),
      turn("t2", { createdAt: T1, },),
      turn("t3", { createdAt: T2, },),
    ],);

    expect((await listQueuedTurns(db, { limit: 2, },)).map((row,) => row.id),).toEqual(["t3", "t2",],);
  });

  it("returns an empty list for an empty queue", async () => {
    expect(await listQueuedTurns(db,),).toEqual([],);
  });
});
