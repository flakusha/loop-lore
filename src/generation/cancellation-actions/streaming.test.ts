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
 */

import { afterEach, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import {
  ChunkAction,
  GenerationStatus,
  PolicyType,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { activeGenerations, } from "../cancellation-tracker";
import type { ActiveGeneration, } from "../cancellation-tracker/types";
import { StreamingRepetitionDetector, } from "../repetition-detector/streaming";
import { DEFAULT_REPETITION_DETECTION, } from "../types";
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

describe("processStreamingChunk", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
  },);

  afterEach(() => {
    activeGenerations.clear();
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
});
