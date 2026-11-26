// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Queue service tests (TASK-harness-multi-agent-turn-queue).
 *
 * Resource contract (parallel-safe): ONE in-memory migrated DB per test (its
 * own user/actor/chat ids), a stub dispatch seam whose turns the test settles
 * by hand (caller-held promise gates — exact ordering, no sleeps), and the
 * process-shared singletons reset around EVERY test in beforeEach/afterEach:
 * resetHarnessTurnQueue (queue singleton), resetHarnessRuntime +
 * resetHarnessAdminSettings + resetExecLogPath (the integration e2e's temp
 * exec-log). The queue's drain machinery is per-INSTANCE, so one instance's
 * parked gates cannot hang another's idle(); every test settles everything
 * it enqueues, so no gates leak into sibling tests. The end-to-end and
 * authorization tests run the REAL dispatchHarnessTurn over in-memory fake
 * adapters and a temp exec-log file (reset afterwards). No child process,
 * no ports, no fixed
 * paths — order-independent under the parallel runner.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { existsSync, mkdtempSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { type HarnessAcpConfig, } from "../../config/schema/harness";
import { resetExecLogPath, setExecLogPath, } from "../../harness/exec-log";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, } from "../../test-utils/insert-helpers";
import { initHarnessAdminSettings, resetHarnessAdminSettings, } from "./admin-settings";
import {
  dispatchHarnessTurn,
  type DispatchHarnessTurnOptions,
  type DispatchHarnessTurnOutcome,
  HarnessDispatchError,
} from "./dispatch";
import { fakeFactory, } from "./fakes";
import {
  createHarnessTurnQueue,
  getHarnessTurnQueue,
  type HarnessQueueDispatch,
  HarnessQueueError,
  type HarnessQueueTurnSpec,
  type HarnessTurnQueue,
  initHarnessTurnQueue,
  resetHarnessTurnQueue,
} from "./queue";
import { insertQueuedTurns, } from "./queue-store";
import {
  createHarnessRuntime,
  getHarnessRuntime,
  type HarnessRuntime,
  initHarnessRuntime,
  resetHarnessRuntime,
} from "./runtime";

let fixture: TestDb;
let userId: string;
let actorId: string;
let chatId: string;
let tag = "";
let idCounter = 0;

let queue: HarnessTurnQueue;
let stub: ReturnType<typeof stubDispatch>;
let execLog: string;

/** The runtime is only an enqueue-time gate for the stub; never touched. */
const FAKE_RUNTIME = {} as HarnessRuntime;

/** One macro-task turn: the whole claim/complete chain is microtasks, so a
 * single event-loop turn deterministically flushes it. No timed waits. */
async function flush(): Promise<void> {
  await new Promise<void>((resolve,) => setImmediate(resolve,));
}

/**
 * A dispatch stub whose in-flight turns the test settles by hand: the queue
 * claims a turn, the stub parks its promise until `settle`/`fail` names the
 * prompt — ordering is exact, there are no sleeps.
 */
function stubDispatch(): {
  dispatch: HarnessQueueDispatch;
  calls: DispatchHarnessTurnOptions[];
  settle: (prompt: string, messageId: string,) => void;
  fail: (prompt: string, error: Error,) => void;
} {
  const calls: DispatchHarnessTurnOptions[] = [];
  const gates = new Map<string, (verdict: Promise<DispatchHarnessTurnOutcome>,) => void>();
  const dispatch: HarnessQueueDispatch = (options,) => {
    calls.push(options,);
    return new Promise<DispatchHarnessTurnOutcome>((resolve, reject,) => {
      gates.set(options.prompt, (verdict,) => verdict.then(resolve, reject,),);
    },);
  };

  return {
    dispatch,
    calls,
    settle(prompt, messageId,) {
      gates.get(prompt,)!(Promise.resolve({ turn: {} as DispatchHarnessTurnOutcome["turn"], messageId, },),);
    },
    fail(prompt, error,) {
      gates.get(prompt,)!((async () => {
        throw error;
      })(),);
    },
  };
}

/** The ACP config the integration test seeds the admin store/runtime with. */
function acpConfig(): HarnessAcpConfig {
  return {
    enabled: true,
    profiles: [
      {
        name: "omp",
        command: ["omp",],
        tiers: { fast: { model: "zai/flash", capabilities: ["tools",], }, },
        tosGrayzoneAcknowledged: true,
      },
    ],
  };
}

/** A one-turn spec against this test's chat fixture. */
function spec(profile: string, prompt: string, turnKey?: string,): HarnessQueueTurnSpec {
  return { profile, prompt, chatId, actorId, turnKey, };
}

/** The queue rows this test currently has, keyed by prompt. */
async function rowsByPrompt(): Promise<
  Map<string, { status: string; error_code: string | null; result_message_id: string | null; attempts: number }>
> {
  const rows = await fixture.db.selectFrom("harness_queue_turns",).selectAll().execute();
  return new Map(rows.map((row,) => [row.prompt, {
    status: row.status,
    error_code: row.error_code,
    result_message_id: row.result_message_id,
    attempts: row.attempts,
  },]),);
}

beforeEach(async () => {
  tag = `q${++idCounter}`;
  userId = `user-harness-queue-${tag}`;
  actorId = `actor-harness-queue-${tag}`;
  chatId = `chat-harness-queue-${tag}`;
  fixture = await createTestDb();

  await fixture.db.insertInto("users",).values({
    id: userId,
    username: `harness-queue-${tag}`,
    display_name: "Harness Queue",
    role: "solo",
    status: "active",
    settings: "{}",
  },).execute();

  await insertActors(fixture.db, "Alice", {
    id: actorId,
    actor_type: "character",
    owner_id: userId,
    agent_type: "ai",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
  } as never,);

  await fixture.db.insertInto("chats",).values({
    id: chatId,
    name: "Harness Queue",
    type: "direct",
    mode: "direct",
    created_by: userId,
    max_turns: null,
  } as never,).execute();

  stub = stubDispatch();
  queue = createHarnessTurnQueue({ database: fixture.db, runtime: () => FAKE_RUNTIME, dispatch: stub.dispatch, },);
},);

afterEach(async () => {
  resetHarnessTurnQueue();
  resetHarnessRuntime();
  resetHarnessAdminSettings();
  resetExecLogPath();
  await destroyTestDb(fixture,);
},);

describe("enqueue", () => {
  it("refuses an empty batch", async () => {
    try {
      await queue.enqueue({ requestedBy: userId, requestedRole: "admin", turns: [], },);
      expect.unreachable();
    } catch (error) {
      expect(error,).toBeInstanceOf(HarnessQueueError,);
      expect((error as HarnessQueueError).code,).toBe("empty_batch",);
    }
  });

  it("refuses to enqueue while the integration is disabled", async () => {
    const disabled = createHarnessTurnQueue({ database: fixture.db, runtime: () => null, dispatch: stub.dispatch, },);
    try {
      await disabled.enqueue({ requestedBy: userId, requestedRole: "admin", turns: [spec("omp", "never",),], },);
      expect.unreachable();
    } catch (error) {
      expect(error,).toBeInstanceOf(HarnessQueueError,);
      expect((error as HarnessQueueError).code,).toBe("harness_disabled",);
    }

    expect(stub.calls,).toHaveLength(0,);
  });
});

describe("batch run", () => {
  it("runs a batch to completion and lands the outcome on the rows", async () => {
    const batch = await queue.enqueue({
      requestedBy: userId,
      requestedRole: "admin",
      turns: [spec("a", "first", "tk-1",), spec("b", "second",),],
    },);

    expect(batch.turnIds,).toHaveLength(2,);

    // flush = one event-loop turn: the claim pass is all microtasks, so the
    // gated dispatches are parked and counted here. idle() would hang — it
    // waits for the TURN results, which only `settle` produces.
    await flush();
    // Both claims went out at once (two profiles, cap 2), both are running.
    expect(stub.calls,).toHaveLength(2,);
    expect((await rowsByPrompt()).get("first",)?.status,).toBe("running",);
    expect((await rowsByPrompt()).get("second",)?.status,).toBe("running",);

    // The dispatch runs under the ENQUEUEING principal with the stored binding.
    // Call order within the batch is FIFO per profile; same-second batches are
    // tie-broken by row id (a uuid), so find by prompt, not by index.
    const firstCall = stub.calls.find((call,) => call.prompt === "first");
    const secondCall = stub.calls.find((call,) => call.prompt === "second");
    expect(firstCall?.userId,).toBe(userId,);
    expect(firstCall?.role,).toBe("admin",);
    expect(firstCall?.chatId,).toBe(chatId,);
    expect(firstCall?.actorId,).toBe(actorId,);
    expect(firstCall?.turnKey,).toBe("tk-1",);
    expect(secondCall?.turnKey,).toBeUndefined();

    stub.settle("first", "msg-1",);
    stub.settle("second", "msg-2",);
    await queue.idle();

    const rows = await rowsByPrompt();
    expect(rows.get("first",),).toEqual({
      status: "completed",
      error_code: null,
      result_message_id: "msg-1",
      attempts: 1,
    },);

    expect(rows.get("second",),).toEqual({
      status: "completed",
      error_code: null,
      result_message_id: "msg-2",
      attempts: 1,
    },);
  });

  it("serializes turns on one profile and fans out across profiles", async () => {
    const single = createHarnessTurnQueue({
      database: fixture.db,
      runtime: () => FAKE_RUNTIME,
      dispatch: stub.dispatch,
      maxConcurrent: 2,
    },);

    await single.enqueue({
      requestedBy: userId,
      requestedRole: "admin",
      turns: [spec("p1", "one",), spec("p1", "two",), spec("p2", "three",),],
    },);

    await flush();

    // p1 is busy with "one", so only "one" and "three" claimed; "two" waits.
    expect(stub.calls,).toHaveLength(2,);
    expect(stub.calls.map((call,) => call.prompt),).toEqual(["one", "three",],);

    stub.settle("one", "msg-1",);
    await flush();
    // "one" finished, so "two" (same profile, FIFO) is claimed next.
    expect(stub.calls,).toHaveLength(3,);
    expect(stub.calls[2]?.prompt,).toBe("two",);

    stub.settle("two", "msg-2",);
    stub.settle("three", "msg-3",);
    await single.idle();

    const rows = await rowsByPrompt();
    expect([...rows.values(),].every((row,) => row.status === "completed"),).toBe(true,);
  });

  it("a failed dispatch is terminal with the dispatch's refusal code", async () => {
    await queue.enqueue({ requestedBy: userId, requestedRole: "admin", turns: [spec("omp", "broken",),], },);
    await flush();

    stub.fail("broken", new HarnessDispatchError("profile_unknown", "no such profile",),);
    await queue.idle();

    const row = (await rowsByPrompt()).get("broken",);
    expect(row?.status,).toBe("failed",);
    expect(row?.error_code,).toBe("profile_unknown",);
    expect(row?.result_message_id,).toBeNull();

    // Terminal: no retry pass ever re-claims the row.
    await flush();
    expect(stub.calls,).toHaveLength(1,);
  });

  it("an unknown throw reads turn_failed", async () => {
    await queue.enqueue({ requestedBy: userId, requestedRole: "admin", turns: [spec("omp", "boom",),], },);
    await flush();

    stub.fail("boom", new Error("adapter exploded",),);
    await queue.idle();

    const row = (await rowsByPrompt()).get("boom",);
    expect(row?.status,).toBe("failed",);
    expect(row?.error_code,).toBe("turn_failed",);
  });
});

describe("cancel", () => {
  it("cancels a queued turn, never a running one", async () => {
    const single = createHarnessTurnQueue({
      database: fixture.db,
      runtime: () => FAKE_RUNTIME,
      dispatch: stub.dispatch,
      maxConcurrent: 1,
    },);

    const batch = await single.enqueue({
      requestedBy: userId,
      requestedRole: "admin",
      turns: [spec("p1", "head",), spec("p1", "tail",),],
    },);

    await flush();

    // "head" is running on a fake runtime with no registry session, so its
    // cancel reads not_cancellable with a reason; the queued "tail" cancels.
    const [headId, tailId,] = batch.turnIds;
    await expect(single.cancel("no-such-id",),).resolves.toEqual({
      ok: false,
      code: "unknown_turn",
      reason: `queue turn "no-such-id" is unknown`,
    },);

    await expect(single.cancel(headId!,),).resolves.toEqual({
      ok: false,
      code: "not_cancellable",
      reason: "the running turn has no live harness session on this instance",
    },);

    await expect(single.cancel(tailId!,),).resolves.toEqual({ ok: true, },);
    await expect(single.cancel(tailId!,),).resolves.toEqual({
      ok: false,
      code: "not_cancellable",
      reason: "the turn is already cancelled",
    },);

    stub.settle("head", "msg-head",);
    await single.idle();

    const rows = await rowsByPrompt();
    expect(rows.get("head",)?.status,).toBe("completed",);
    expect(rows.get("tail",)?.status,).toBe("cancelled",);
  });

  it("interrupts a running turn through the live harness session", async () => {
    const acp = acpConfig();
    acp.profiles[0]!.name = "p1";
    const { factory, logs, } = fakeFactory({ p1: { models: ["zai/flash",], }, },);
    const runtime = createHarnessRuntime({ acp, factory, },);
    await runtime.registry.ensureProbed("p1",);

    const single = createHarnessTurnQueue({
      database: fixture.db,
      runtime: () => runtime,
      dispatch: stub.dispatch,
      maxConcurrent: 1,
    },);

    const batch = await single.enqueue({
      requestedBy: userId,
      requestedRole: "admin",
      turns: [spec("p1", "head",),],
    },);

    await flush();

    await expect(single.cancel(batch.turnIds[0]!,),).resolves.toEqual({ ok: true, },);
    expect(logs.get("p1",)?.cancels,).toBe(1,);
    expect((await rowsByPrompt()).get("head",)?.status,).toBe("cancelled",);

    // The real dispatch may still settle after the cancel: its late completion
    // must not overwrite the cancelled row.
    stub.settle("head", "msg-head",);
    await single.idle();
    expect((await rowsByPrompt()).get("head",)?.status,).toBe("cancelled",);
  });
});

describe("recoverAndPump", () => {
  it("fails orphaned running rows interrupted and resumes queued ones", async () => {
    await insertQueuedTurns(fixture.db, [
      {
        id: "t-crash",
        batchId: "b1",
        profile: "p1",
        prompt: "crashed",
        chatId,
        actorId,
        requestedBy: userId,
        requestedRole: "admin",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "t-resume",
        batchId: "b1",
        profile: "p2",
        prompt: "resume",
        chatId,
        actorId,
        requestedBy: userId,
        requestedRole: "admin",
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    ],);

    // Simulate the crash: the row was mid-flight when the process died.
    await fixture.db.updateTable("harness_queue_turns",).set({
      status: "running",
      started_at: "2026-01-01T00:00:00.500Z",
      owner_slug: "instance-a",
    },).where("id", "=", "t-crash",).execute();

    // The NEW process's queue: recovery runs before the first pump.
    const next = createHarnessTurnQueue({
      database: fixture.db,
      runtime: () => FAKE_RUNTIME,
      dispatch: stub.dispatch,
      instanceSlug: "instance-a",
    },);

    const interrupted = await next.recoverAndPump();

    expect(interrupted,).toBe(1,);
    const after = await rowsByPrompt();
    expect(after.get("crashed",)?.status,).toBe("failed",);
    expect(after.get("crashed",)?.error_code,).toBe("interrupted",);
    // The queued survivor was claimed right after recovery.
    expect(stub.calls.map((call,) => call.prompt),).toEqual(["resume",],);

    stub.settle("resume", "msg-resume",);
    await next.idle();
    expect((await rowsByPrompt()).get("resume",)?.status,).toBe("completed",);
  });
});

describe("singleton", () => {
  it("init composes the process queue; reset clears it", () => {
    expect(getHarnessTurnQueue(),).toBeNull();
    initHarnessTurnQueue({ database: fixture.db, runtime: () => FAKE_RUNTIME, dispatch: stub.dispatch, },);
    expect(getHarnessTurnQueue(),).not.toBeNull();
    resetHarnessTurnQueue();
    expect(getHarnessTurnQueue(),).toBeNull();
  });
});

describe("end to end through the real dispatch", () => {
  it("lands the assistant row the dispatch produced", async () => {
    execLog = join(mkdtempSync(join(tmpdir(), "harness-queue-",),), "executions.jsonl",);
    setExecLogPath(execLog,);
    initHarnessAdminSettings(acpConfig(),);
    const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], reply: "queued answer", }, },);
    initHarnessRuntime(acpConfig(), factory,);

    // No dispatch override: production is dispatchHarnessTurn itself.
    const real = createHarnessTurnQueue({ database: fixture.db, runtime: getHarnessRuntime, },);
    await real.enqueue({ requestedBy: userId, requestedRole: "solo", turns: [spec("omp", "do the thing",),], },);
    await real.idle();

    const rows = await fixture.db.selectFrom("messages",).selectAll().where("chat_id", "=", chatId,).execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.role,).toBe("assistant",);
    const queued = [...(await rowsByPrompt()).values(),][0];
    expect(queued?.status,).toBe("completed",);
    expect(queued?.result_message_id,).toBe(rows[0]?.id,);
    expect(existsSync(execLog,),).toBe(true,);
  });
});

describe("authorization at admission", () => {
  /**
   * Real dispatch throughout this block: only the production gate can prove
   * what role a turn ran under. Seeds admin settings, a temp exec log and a
   * composed runtime; queues run production dispatch by default.
   */
  function setupAuthRuntime(): void {
    execLog = join(mkdtempSync(join(tmpdir(), "harness-queue-auth-",),), "executions.jsonl",);
    setExecLogPath(execLog,);
    initHarnessAdminSettings(acpConfig(),);
    const { factory, } = fakeFactory({ omp: { models: ["zai/flash",], reply: "queued answer", }, },);
    initHarnessRuntime(acpConfig(), factory,);
  }

  it("refuses a queued turn when the caller is demoted before the pump", async () => {
    // A zero-cap queue enqueues without claiming: the demotion lands before
    // any pump resolves the role, so no timing race is involved.
    setupAuthRuntime();
    const parked = createHarnessTurnQueue({
      database: fixture.db,
      runtime: getHarnessRuntime,
      maxConcurrent: 0,
    },);

    await parked.enqueue({
      requestedBy: userId,
      requestedRole: "solo",
      turns: [spec("omp", "stale-role",),],
    },);

    await fixture.db.updateTable("users",).set({ role: "user", },).where("id", "=", userId,).execute();

    const active = createHarnessTurnQueue({
      database: fixture.db,
      runtime: getHarnessRuntime,
    },);

    await active.recoverAndPump();
    await active.idle();

    // The enqueue-time snapshot reached dispatch but authorized nothing: the
    // gate judged the live (demoted) role and the row records why.
    expect((await rowsByPrompt()).get("stale-role",),).toMatchObject({
      status: "failed",
      error_code: "role_denied",
      result_message_id: null,
    },);

    const staleMessages = await fixture.db.selectFrom("messages",).selectAll().where("chat_id", "=", chatId,).execute();
    expect(staleMessages,).toHaveLength(0,);
  });

  it("runs a demotion inside the claim-to-admission window at the new role", async () => {
    // Demote exactly where the old queue-side check used to sit: after the
    // claim, before admission. The gate must still fail the turn closed.
    setupAuthRuntime();
    const demoteThenDispatch: HarnessQueueDispatch = async (options,) => {
      await fixture.db.updateTable("users",).set({ role: "user", },).where("id", "=", userId,).execute();
      const runtime = getHarnessRuntime();
      if (!runtime) { throw new Error("auth test runtime not composed",); }
      return dispatchHarnessTurn({ ...options, runtime, },);
    };

    const active = createHarnessTurnQueue({
      database: fixture.db,
      runtime: getHarnessRuntime,
      dispatch: demoteThenDispatch,
    },);

    await active.enqueue({
      requestedBy: userId,
      requestedRole: "solo",
      turns: [spec("omp", "window-demotion",),],
    },);

    await active.idle();

    expect((await rowsByPrompt()).get("window-demotion",),).toMatchObject({
      status: "failed",
      error_code: "role_denied",
      result_message_id: null,
    },);

    const messages = await fixture.db.selectFrom("messages",).selectAll().where("chat_id", "=", chatId,).execute();
    expect(messages,).toHaveLength(0,);
  });

  it("keeps pumping other callers after refusing a demoted turn", async () => {
    const healthyId = `user-harness-queue-${tag}-healthy`;
    await fixture.db.insertInto("users",).values({
      id: healthyId,
      username: `harness-queue-${tag}-healthy`,
      display_name: "Harness Queue Healthy",
      role: "solo",
      status: "active",
      settings: "{}",
    },).execute();

    // Both rows are queued before any queue pumps; only the first caller is
    // demoted, so the second turn must still run.
    await insertQueuedTurns(fixture.db, [
      {
        id: "t-stale",
        batchId: "b-auth",
        profile: "omp",
        prompt: "stale",
        chatId,
        actorId,
        requestedBy: userId,
        requestedRole: "solo",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "t-live",
        batchId: "b-auth",
        profile: "omp",
        prompt: "live",
        chatId,
        actorId,
        requestedBy: healthyId,
        requestedRole: "solo",
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    ],);

    setupAuthRuntime();

    await fixture.db.updateTable("users",).set({ role: "user", },).where("id", "=", userId,).execute();

    const active = createHarnessTurnQueue({
      database: fixture.db,
      runtime: getHarnessRuntime,
    },);

    await active.recoverAndPump();
    await active.idle();

    const rows = await rowsByPrompt();
    expect(rows.get("stale",),).toMatchObject({ status: "failed", error_code: "role_denied", },);
    expect(rows.get("live",),).toMatchObject({ status: "completed", },);
    expect(rows.get("live",)?.result_message_id,).not.toBeNull();
  });
});
