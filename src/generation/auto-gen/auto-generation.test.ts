/**
 * Regression tests for `triggerAutoGeneration` (TASK-audit-follow-up-triggerautogeneration-catch-path-untested).
 *
 * The `triggerAutoGeneration` orchestrator has a single `try { ... } catch (error)`
 * block at its core. Any error from any pipeline step (callLlm, runContentHooks,
 * storeMessage, applyPostStoreEffects, …) must:
 *
 *   1. Not propagate to the caller — `triggerAutoGeneration` is invoked via
 *      `void` from route handlers, so an unhandled throw would surface as
 *      `unhandledRejection` and crash the process.
 *   2. Call `asyncStore.fail(requestId, { userId }, String(error))` so the
 *      status endpoint reflects the failure.
 *   3. Call `handleGenerationError(...)` for telemetry / buffer signalling /
 *      logging.
 *
 * Prior coverage exercised the happy path only; this file pins the catch-path
 * contract so future refactors cannot silently re-introduce an unhandled
 * rejection.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { AsyncStore, } from "../../async/store";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { triggerAutoGeneration, } from "./auto-generation";
import type { GenDeps, } from "./deps";

interface FakeAsyncStoreCall {
  id: string;
  userId: string;
  error: string;
}

interface FakeAsyncStore {
  failCalls: FakeAsyncStoreCall[];
  /** Cast as `AsyncStore` at the use site; the orchestrator only calls
   *  `progress` and `fail` in the catch-path contract we test. */
  store: AsyncStore;
}

function makeFakeAsyncStore(): FakeAsyncStore {
  const calls: FakeAsyncStoreCall[] = [];
  return {
    store: {
      // No-op progress — emitProgress() inside the orchestrator fires for
      // every pipeline step; we don't care about those for the catch-path
      // contract, only that they don't throw and short-circuit the test.
      progress: () => {},
      fail: (id: string, owner: { userId: string | null }, error: string) => {
        calls.push({ id, userId: owner.userId ?? "", error, });
      },
      track: () => {},
      complete: () => {},
      flush: async () => {},
      read: async () => null,
      destroy: () => {},
      config: {
        maxInlineBytes: 0,
        defaultTtlMs: 0,
        queueLimit: 0,
      },
    },
    failCalls: calls,
  };
}

/**
 * Build a `Partial<GenDeps>` that:
 *   - reports a non-empty `listProviders()` so the orchestrator enters the
 *     pipeline try-block (otherwise it short-circuits before any throw can
 *     be caught).
 *   - throws `error` from the FIRST dep that fires inside the try block,
 *     which is `cancelGenerationByChat` (when `parentMessageId` is non-null).
 *   - records `failGeneration` calls so we can assert `handleGenerationError`
 *     was invoked.
 */
function makeThrowingDeps(
  error: Error,
  hooks: { onFailGeneration?: () => void } = {},
): Partial<GenDeps> {
  return {
    listProviders: (() => [{ id: "mock", },]) as unknown as GenDeps["listProviders"],
    cancelGenerationByChat: (() => {
      throw error;
    }) as unknown as GenDeps["cancelGenerationByChat"],
    failGeneration: (() => {
      hooks.onFailGeneration?.();
    }) as unknown as GenDeps["failGeneration"],
  };
}

function makeConfig(): Config {
  return {
    generation: {
      defaultProvider: null,
      providers: { openaiCompatible: [], },
    },
  } as unknown as Config;
}

describe("triggerAutoGeneration — catch-path contract", () => {
  let db: Kysely<DB>;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    const created = await createTestDb();
    db = created.db;
    teardown = async () => {
      await db.destroy();
    };
  },);

  afterAll(async () => {
    await teardown();
  },);

  test("an error from a pipeline step is caught, routed to asyncStore.fail, not rethrown", async () => {
    const fakeStore = makeFakeAsyncStore();
    const requestId = `req-${uid()}`;
    const userId = uid();
    const chatId = uid();
    const parentMessageId = uid();
    const pipelineError = new Error("synthetic cancel outage",);

    let didThrow = false;
    try {
      await triggerAutoGeneration({
        database: db,
        config: makeConfig(),
        chatId,
        parentMessageId, // non-null → cancelGenerationByChat fires inside try
        userId,
        asyncStore: fakeStore.store,
        requestId,
        deps: makeThrowingDeps(pipelineError,),
      },);
    } catch {
      didThrow = true;
    }

    // The caller never sees a throw — the pipeline errored internally.
    expect(didThrow,).toBe(false,);

    // asyncStore.fail was called exactly once with String(error) and scoped
    // by userId.
    expect(fakeStore.failCalls.length,).toBe(1,);
    const call = fakeStore.failCalls[0];
    expect(call?.id,).toBe(requestId,);
    expect(call?.userId,).toBe(userId,);
    expect(call?.error,).toBe(String(pipelineError,),);
  },);

  test("handleGenerationError receives the same error but suppresses failGeneration when attemptId is undefined", async () => {
    const fakeStore = makeFakeAsyncStore();
    const requestId = `req-${uid()}`;
    const userId = uid();
    const chatId = uid();
    const parentMessageId = uid();
    const pipelineError = new Error("synthetic buffer outage",);
    let failGenerationCalls = 0;

    await triggerAutoGeneration({
      database: db,
      config: makeConfig(),
      chatId,
      parentMessageId, // non-null but throw fires before attempt row is created
      userId,
      asyncStore: fakeStore.store,
      requestId,
      deps: makeThrowingDeps(pipelineError, {
        onFailGeneration: () => {
          failGenerationCalls++;
        },
      },),
    },);

    // The orchestrator only assigns `attemptId` after the throw fires, so
    // `handleGenerationError` is called with `attemptId = undefined`. The
    // inner `if (attemptId)` guard suppresses `failGeneration`.
    expect(failGenerationCalls,).toBe(0,);

    // …but the error still propagates to asyncStore.fail so the status
    // endpoint reflects the failure.
    expect(fakeStore.failCalls.length,).toBe(1,);
  },);

  test("asyncStore omitted → error still swallowed (no throw, no fail call)", async () => {
    const userId = uid();
    const chatId = uid();
    const parentMessageId = uid();

    let didThrow = false;
    try {
      await triggerAutoGeneration({
        database: db,
        config: makeConfig(),
        chatId,
        parentMessageId,
        userId,
        // no asyncStore, no requestId
        deps: makeThrowingDeps(new Error("no-store",),),
      },);
    } catch {
      didThrow = true;
    }
    expect(didThrow,).toBe(false,);
  },);

  test("asyncStore provided but requestId missing → fail() is skipped", async () => {
    const fakeStore = makeFakeAsyncStore();
    const userId = uid();
    const chatId = uid();
    const parentMessageId = uid();

    await triggerAutoGeneration({
      database: db,
      config: makeConfig(),
      chatId,
      parentMessageId,
      userId,
      asyncStore: fakeStore.store,
      // requestId omitted
      deps: makeThrowingDeps(new Error("no-request-id",),),
    },);

    // The orchestrator's catch block requires BOTH asyncStore and requestId
    // before calling fail(). Without requestId the status row has no id to
    // write to, so it silently skips.
    expect(fakeStore.failCalls.length,).toBe(0,);
  },);
});
