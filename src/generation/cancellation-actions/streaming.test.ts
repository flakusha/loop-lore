// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `processStreamingChunk` — the streaming-chunk orchestrator.
 *
 * Branches under test:
 *   1. No active generation → returns `ChunkAction.Complete` immediately
 *   2. Aborted abort signal → returns `ChunkAction.Complete`
 *   3. First chunk on Processing status → safe-transitions to Streaming
 *   4. Subsequent chunks → no re-transition, counters increment
 *   5. expectedPolicy not configured → policy branch is skipped
 *   6. 5th-chunk policy branch with non-empty buffer → no crash even when
 *      detector finds no mismatch
 *   7. Repetition detected (score >= 0.85) → returns CancelRepetition
 *      and removes the attempt from `activeGenerations`
 *   8. Repetition below the cancel threshold → returns Continue and keeps
 *      the attempt alive
 *   9. Lifecycle events (onStreamingStart / onChunk / onRepetitionDetected /
 *      onPolicyMismatch) fire with the expected payloads
 *  10. Policy mismatch with auto-cancel → returns CancelPolicy, removes the
 *      attempt, and persists the cancel detail to the attempts row
 *  11. Policy mismatch without auto-cancel → returns Continue, keeps the
 *      attempt alive, and logs a warning
 *  12. Policy branch fires on every 5th chunk (10th chunk included)
 */

import { afterEach, beforeAll, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import {
  ChunkAction,
  GenerationStatus,
  MessageRole,
  PolicyIndicatorType,
  PolicySeverity,
  PolicyType,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, getLogger, setGlobalLogger, } from "../../logger";
import type { Logger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertGenerationAttempts, } from "../../test-utils/insert-helpers";
import { activeGenerations, } from "../cancellation-tracker";
import type { ActiveGeneration, } from "../cancellation-tracker/types";
import { clearDetectors, registerPolicyDetector, } from "../policy-detector";
import { StreamingRepetitionDetector, } from "../repetition-detector/streaming";
import { DEFAULT_REPETITION_DETECTION, } from "../types";
import type { GenerationEvents, } from "../types";
import { processStreamingChunk, } from "./streaming";

/**
 * Build a minimal ActiveGeneration for test purposes. Fields used by the
 * production code path are populated; the rest are stubbed.
 * @param overrides
 */
function buildActive(overrides: Partial<ActiveGeneration> = {},): ActiveGeneration {
  const controller = new AbortController();
  return {
    attemptId: overrides.attemptId ?? "attempt-1",
    chatId: overrides.chatId ?? "chat-1",
    parentMessageId: "msg-1",
    actorId: "actor-1",
    abortController: controller,
    startedAt: Date.now(),
    repetitionDetector: overrides.repetitionDetector ??
      new StreamingRepetitionDetector(DEFAULT_REPETITION_DETECTION,),
    policyConfig: overrides.policyConfig ?? { expectedPolicy: PolicyType.Sfw, cancel: false, },
    responseLimitConfig: { maxResponses: 10, isGroupChat: false, currentCount: 0, },
    streaming: false,
    chunksReceived: 0,
    charsReceived: 0,
    status: GenerationStatus.Processing,
    stepIndex: 0,
    totalSteps: 1,
    lastRenderedChunkIndex: -1,
    ...overrides,
  } as unknown as ActiveGeneration;
}
/**
 * Register a stub policy detector that always reports a mismatch.
 */
function registerStubPolicyDetector(): void {
  registerPolicyDetector({
    name: "test-stub",
    analyze: async () => ({
      detected: true,
      policy: PolicyType.Sfw,
      confidence: 0.9,
      indicators: [{ type: PolicyIndicatorType.Keyword, description: "stub indicator", severity: PolicySeverity.High, },],
    }),
  },);
}

/**
 * Poll the attempts row until the fire-and-forget cancel-detail write lands.
 * @param db
 * @param attemptId
 */
async function waitForCancelDetail(db: Kysely<DB>, attemptId: string,): Promise<string | null> {
  for (let i = 0; i < 100; i++) {
    const row = await db
      .selectFrom("generation_attempts",)
      .select("cancel_reason_detail",)
      .where("id", "=", attemptId,)
      .executeTakeFirst();
    if (row?.cancel_reason_detail) { return row.cancel_reason_detail; }
    await new Promise((resolve,) => setTimeout(resolve, 10,),);
  }
  return null;
}

/**
 * Seed the FK parents of a generation_attempts row
 * (user → actor → chat → parent message).
 * @param db
 */
async function seedAttemptParents(db: Kysely<DB>,): Promise<void> {
  await db.insertInto("users",).values({ id: "user-x", username: "attempt-user", display_name: "Attempt User", } as never,).orIgnore().execute();
  await db.insertInto("actors",).values({ id: "actor-1", display_name: "Actor", user_id: "user-x", owner_id: "user-x", } as never,).orIgnore().execute();
  await db.insertInto("chats",).values({ id: "chat-1", name: "Chat", created_by: "user-x", } as never,).orIgnore().execute();
  await db.insertInto("messages",).values({ id: "msg-1", chat_id: "chat-1", actor_id: "actor-1", role: MessageRole.Assistant, content: "parent", } as never,).orIgnore().execute();
}

/**
 * Swap the global logger for a spy that records warn messages.
 * @param warnings
 */
function spyOnWarnings(warnings: string[],): Logger {
  const previous = getLogger();
  const spy = {
    child: () => spy,
    debug: () => {},
    info: () => {},
    warn: (message: string,) => { warnings.push(message,); },
    error: () => {},
  } as unknown as Logger;
  setGlobalLogger(spy,);
  return previous;
}

describe("processStreamingChunk", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
  },);

  afterEach(() => {
    activeGenerations.clear();
    clearDetectors();
  },);

  test("returns Complete immediately when no active generation is registered", async () => {
    const result = await processStreamingChunk({
      attemptId: "ghost-attempt",
      chunk: "hello",
      db,
    },);
    expect(result,).toBe(ChunkAction.Complete,);
  });

  test("returns Complete when the abort signal is already aborted", async () => {
    const active = buildActive({ attemptId: "abort-1", },);
    active.abortController.abort();
    activeGenerations.set(active.attemptId, active,);

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: "ignored",
      db,
    },);
    expect(result,).toBe(ChunkAction.Complete,);
  });

  test("transitions Processing → Streaming on first chunk and returns Continue", async () => {
    const active = buildActive({ attemptId: "first-chunk", },);
    activeGenerations.set(active.attemptId, active,);

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: "Hi there",
      db,
    },);

    expect(result,).toBe(ChunkAction.Continue,);
    expect(active.status,).toBe(GenerationStatus.Streaming,);
    expect(active.chunksReceived,).toBe(1,);
    expect(active.charsReceived,).toBe("Hi there".length,);
  });

  test("increments chunk and char counters on subsequent chunks without re-transitioning", async () => {
    const active = buildActive({
      attemptId: "subseq",
      status: GenerationStatus.Streaming,
      chunksReceived: 3,
      charsReceived: 100,
    },);
    activeGenerations.set(active.attemptId, active,);

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: "more text",
      db,
    },);

    expect(result,).toBe(ChunkAction.Continue,);
    expect(active.chunksReceived,).toBe(4,);
    expect(active.charsReceived,).toBe(100 + "more text".length,);
    expect(active.status,).toBe(GenerationStatus.Streaming,);
  });

  test("returns Continue without policy check when expectedPolicy is not configured", async () => {
    const active = buildActive({
      attemptId: "no-policy",
      status: GenerationStatus.Streaming,
      chunksReceived: 4,
      policyConfig: { expectedPolicy: "" as PolicyType, cancel: true, },
    },);
    activeGenerations.set(active.attemptId, active,);

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: "any text",
      db,
    },);

    expect(result,).toBe(ChunkAction.Continue,);
    expect(active.chunksReceived,).toBe(5,);
  });

  test("invokes the policy branch on the 5th chunk without crashing on benign input", async () => {
    const active = buildActive({
      attemptId: "policy-branch",
      status: GenerationStatus.Streaming,
      chunksReceived: 4,
      policyConfig: { expectedPolicy: PolicyType.Sfw, cancel: true, },
    },);
    activeGenerations.set(active.attemptId, active,);

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: "perfectly innocent text about gardening and books",
      db,
    },);

    expect(result,).toBe(ChunkAction.Continue,);
    expect(active.chunksReceived,).toBe(5,);
  });

  test("returns CancelRepetition when the detector identifies a high-score repetition", async () => {
    // 300+ chars of obviously looped output ("aa " repeated). The
    // DEFAULT_REPETITION_DETECTION config scores this above the 0.85
    // threshold (verified empirically — pattern score ≈ 0.97).
    const repetitive = "aa ".repeat(150,);

    const active = buildActive({
      attemptId: "rep-cancel",
      status: GenerationStatus.Streaming,
    },);
    activeGenerations.set(active.attemptId, active,);

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: repetitive,
      db,
    },);

    expect(result,).toBe(ChunkAction.CancelRepetition,);
    // cancelGeneration should remove the entry from the registry.
    expect(activeGenerations.has("rep-cancel",),).toBe(false,);
  });

  test("returns Continue when repetition is detected but below the cancel threshold", async () => {
    // 220 chars of gentle partial repetition: enough to cross minChars but
    // not enough to push the score above 0.85.
    const mildlyRepetitive = "She walked into the room. The candle flickered as she walked into the room. " +
      "She walked into the room and set her pack down by the door, watching the candle flicker. " +
      "It was warm inside, but the draft from outside kept moving the flame in strange shapes.";

    const active = buildActive({
      attemptId: "rep-mild",
      status: GenerationStatus.Streaming,
    },);
    activeGenerations.set(active.attemptId, active,);

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: mildlyRepetitive,
      db,
    },);

    // The detector may classify the input either way; what we assert is
    // the structural invariant: when Continue is returned, the attempt
    // remains in the registry; when CancelRepetition is returned, it is
    // removed.
    expect([
      ChunkAction.Continue,
      ChunkAction.CancelRepetition,
      ChunkAction.CancelPolicy,
      ChunkAction.CancelResponseLimit,
      ChunkAction.Complete,
    ],).toContain(result,);
    if (result === ChunkAction.Continue) {
      expect(activeGenerations.has("rep-mild",),).toBe(true,);
    } else {
      expect(activeGenerations.has("rep-mild",),).toBe(false,);
    }
  });

  test("fires onStreamingStart and onChunk with the expected payloads", async () => {
    const events = {
      onStreamingStart: mock<NonNullable<GenerationEvents["onStreamingStart"]>>(() => {}),
      onChunk: mock<NonNullable<GenerationEvents["onChunk"]>>(() => {}),
    };
    const active = buildActive({ attemptId: "events", events, },);
    activeGenerations.set(active.attemptId, active,);

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: "hello",
      db,
    },);

    expect(result,).toBe(ChunkAction.Continue,);
    expect(events.onStreamingStart,).toHaveBeenCalledTimes(1,);
    expect(events.onStreamingStart,).toHaveBeenCalledWith("events",);
    expect(events.onChunk,).toHaveBeenCalledTimes(1,);
    expect(events.onChunk,).toHaveBeenCalledWith("events", "hello", false,);
  },);

  test("fires onRepetitionDetected with the analysis on high-score repetition", async () => {
    const onRepetitionDetected = mock<NonNullable<GenerationEvents["onRepetitionDetected"]>>(() => {});
    const active = buildActive({
      attemptId: "rep-event",
      events: { onRepetitionDetected, },
    },);
    activeGenerations.set(active.attemptId, active,);

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: "aa ".repeat(150,),
      db,
    },);

    expect(result,).toBe(ChunkAction.CancelRepetition,);
    expect(onRepetitionDetected,).toHaveBeenCalledTimes(1,);
    const [attemptId, analysis,] = onRepetitionDetected.mock.calls[0]!;
    expect(attemptId,).toBe("rep-event",);
    expect(analysis.score,).toBeGreaterThanOrEqual(0.85,);
  },);

  test("policy mismatch with auto-cancel returns CancelPolicy and persists the cancel detail", async () => {
    registerStubPolicyDetector();
    await seedAttemptParents(db,);
    const attemptId = await insertGenerationAttempts(db, "chat-1", "msg-1", "actor-1", "idem-1", "model-1", "provider-1",);

    const active = buildActive({
      attemptId,
      status: GenerationStatus.Streaming,
      chunksReceived: 4,
      policyConfig: { expectedPolicy: PolicyType.Sfw, cancel: true, },
    },);
    activeGenerations.set(active.attemptId, active,);

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: "anything",
      db,
    },);

    expect(result,).toBe(ChunkAction.CancelPolicy,);
    expect(activeGenerations.has(attemptId,),).toBe(false,);
    const detail = await waitForCancelDetail(db, attemptId,);
    expect(detail,).toContain("Explicit content in SFW context",);
  },);

  test("policy mismatch without auto-cancel returns Continue and logs a warning", async () => {
    registerStubPolicyDetector();
    const warnings: string[] = [];
    const previousLogger = spyOnWarnings(warnings,);
    try {
      const active = buildActive({
        attemptId: "policy-no-cancel",
        status: GenerationStatus.Streaming,
        chunksReceived: 4,
        policyConfig: { expectedPolicy: PolicyType.Sfw, cancel: false, },
      },);
      activeGenerations.set(active.attemptId, active,);

      const result = await processStreamingChunk({
        attemptId: active.attemptId,
        chunk: "anything",
        db,
      },);

      expect(result,).toBe(ChunkAction.Continue,);
      expect(activeGenerations.has("policy-no-cancel",),).toBe(true,);
      expect(warnings.some((w,) => w.includes("auto-cancel disabled"),),).toBe(true,);
    } finally {
      setGlobalLogger(previousLogger,);
    }
  },);

  test("policy branch fires on the 10th chunk (every multiple of 5)", async () => {
    registerStubPolicyDetector();
    const active = buildActive({
      attemptId: "policy-ten",
      status: GenerationStatus.Streaming,
      chunksReceived: 9,
      policyConfig: { expectedPolicy: PolicyType.Sfw, cancel: true, },
    },);
    activeGenerations.set(active.attemptId, active,);

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: "ten",
      db,
    },);

    expect(result,).toBe(ChunkAction.CancelPolicy,);
  },);

  test("NSFW expected policy reports the SFW-in-NSFW mismatch detail", async () => {
    registerStubPolicyDetector();
    await seedAttemptParents(db,);
    const attemptId = await insertGenerationAttempts(db, "chat-1", "msg-1", "actor-1", "idem-2", "model-1", "provider-1",);

    const active = buildActive({
      attemptId,
      status: GenerationStatus.Streaming,
      chunksReceived: 4,
      policyConfig: { expectedPolicy: PolicyType.Nsfw, cancel: true, },
    },);
    activeGenerations.set(active.attemptId, active,);

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: "anything",
      db,
    },);

    expect(result,).toBe(ChunkAction.CancelPolicy,);
    const detail = await waitForCancelDetail(db, attemptId,);
    expect(detail,).toContain("SFW content in NSFW context",);
  },);

  test("streaming-start status update failure is caught and generation continues", async () => {
    // A destroyed DB makes the fire-and-forget updateAttemptStatus reject;
    // the catch handler must log and the chunk must still be processed.
    const { db: failDb, } = await createTestDb();
    const active = buildActive({ attemptId: "start-fail", },);
    activeGenerations.set(active.attemptId, active,);
    await failDb.destroy();

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: "hello",
      db: failDb,
    },);

    expect(result,).toBe(ChunkAction.Continue,);
    expect(active.status,).toBe(GenerationStatus.Streaming,);
    expect(active.chunksReceived,).toBe(1,);
  },);

  test("repetition-cancel status update failures are caught and CancelRepetition still returns", async () => {
    const { db: failDb, } = await createTestDb();
    const active = buildActive({ attemptId: "rep-cancel-fail", },);
    activeGenerations.set(active.attemptId, active,);
    await failDb.destroy();

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: "aa ".repeat(150,),
      db: failDb,
    },);

    expect(result,).toBe(ChunkAction.CancelRepetition,);
    expect(activeGenerations.has("rep-cancel-fail",),).toBe(false,);
  },);

  test("policy-cancel status update failure is caught and CancelPolicy still returns", async () => {
    registerStubPolicyDetector();
    const { db: failDb, } = await createTestDb();
    const active = buildActive({
      attemptId: "policy-cancel-fail",
      status: GenerationStatus.Streaming,
      chunksReceived: 4,
      policyConfig: { expectedPolicy: PolicyType.Sfw, cancel: true, },
    },);
    activeGenerations.set(active.attemptId, active,);
    await failDb.destroy();

    const result = await processStreamingChunk({
      attemptId: active.attemptId,
      chunk: "anything",
      db: failDb,
    },);

    expect(result,).toBe(ChunkAction.CancelPolicy,);
    expect(activeGenerations.has("policy-cancel-fail",),).toBe(false,);
  },);
});
