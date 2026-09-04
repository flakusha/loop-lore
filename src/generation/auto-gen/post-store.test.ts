// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for applyPostStoreEffects.
 *
 * BUG-bug-hallucination-guard-runs-outside-try-catch-after-message:
 * detectHallucinations(...) runs AFTER storeMessage has inserted the
 * assistant message. Previously, a thrown DB error inside the guard would
 * unwind applyPostStoreEffects before completeGeneration / buffer append /
 * signalDone / group cascade ran — leaving the message with an uncompleted
 * generation attempt and the SSE buffer never signaled.
 *
 * These tests mock the chat module's detectHallucinations to throw and
 * assert the post-store pipeline still finalizes the attempt.
 *
 * mock.module is gated to the isolated canonical gate (`bun run test:unit` /
 * `bun run check`); plain `bun test src/` skips this file (see
 * src/test-utils/isolate-only.ts).
 *
 * The dynamic `await import("./post-store")` is intentional — it sits
 * behind the `mock.module(...)` boundary used to stub the chat module's
 * detectHallucinations and the telemetry service. This is the canonical
 * Bun pattern for `mock.module` interception.
 */
import { beforeEach, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { CompleteGenerationOpts, } from "../cancellation-tracker/types";
import type { GenDeps, } from "./deps";

createLogger({ level: "error", },);

if (ISOLATED) {
  // Force detectHallucinations to throw a DB-style error so we exercise the
  // try/catch added around it. Everything else from the chat module keeps
  // its real implementation via the source module path.
  mock.module("../../chat", () => {
    const realChat = require("../../chat/hallucination-guard/index.ts",);
    return {
      detectHallucinations: async () => {
        throw new Error("SQLITE_BUSY: database is locked",);
      },
      generateRandomEvent: realChat.generateRandomEvent ?? (() => null),
    };
  },);
  // Keep telemetry quiet in tests.
  mock.module("../../telemetry/service", () => ({
    record: async () => {/* noop */},
    isTelemetryEnabled: () => false,
  }),);
}

const { applyPostStoreEffects, } = await import("./post-store");

/**
 * Build a GenDeps stub that records calls to the post-store finalize
 * pipeline (completeGeneration, buffer.append, buffer.signalDone,
 * scheduleBufferCleanup).
 * @param appendCalls captured `kind:payloadLen` entries
 * @param signalDone counter mutated on each call
 * @param scheduleCalls captured chatIds
 */
function makeDeps(
  appendCalls: string[],
  signalDone: { count: number },
  scheduleCalls: string[],
): GenDeps {
  return {
    completeGeneration: mock(
      async (_opts: CompleteGenerationOpts,) => {/* noop */},
    ) as unknown as GenDeps["completeGeneration"],
    getOrCreateBuffer: () => ({
      append: (kind: string, payload: string,) => {
        appendCalls.push(`${kind}:${payload.length}`,);
      },
      signalDone: () => {
        signalDone.count += 1;
      },
    }),
    scheduleBufferCleanup: mock((chatId: string,) => {
      scheduleCalls.push(chatId,);
    },) as unknown as GenDeps["scheduleBufferCleanup"],
    markedParse: (s: string,) => s,
  } as unknown as GenDeps;
}

describeOrSkip("applyPostStoreEffects — hallucination guard failure must not strand the message", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    const created = await createTestDb();
    db = created.db;
  },);

  test(
    "detectHallucinations throwing does NOT prevent completeGeneration / buffer append / signalDone",
    async () => {
      const appendCalls: string[] = [];
      const signalDone = { count: 0, };
      const scheduleCalls: string[] = [];
      const d = makeDeps(appendCalls, signalDone, scheduleCalls,);

      // Should NOT throw, even though detectHallucinations is mocked to
      // throw a DB error after the (assumed-already-stored) assistant message.
      await expect(
        applyPostStoreEffects({
          d,
          database: db,
          config: {} as never,
          chatId: "chat-test-1",
          userId: "user-1",
          actorId: "actor-1",
          actorName: "Actor One",
          characterId: "actor-1",
          messageId: "msg-1",
          content: "Hello, this is a long enough message to actually analyze for entities.",
          thinking: undefined,
          tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, },
          finishReason: "stop",
          moodShiftDelta: undefined,
          worldId: "world-1",
          attemptId: "attempt-1",
          resolvedModel: "m",
          resolvedProviderName: "p",
          isGroupChat: false,
          cascadeDepth: 0,
        },),
      ).resolves.toBeUndefined();

      // The whole point of the bug: completion must run.
      expect(d.completeGeneration,).toHaveBeenCalledTimes(1,);
      // Buffer append (final stream-update render) must run.
      expect(appendCalls.length,).toBeGreaterThan(0,);
      // signalDone must run.
      expect(signalDone.count,).toBe(1,);
      // Cleanup scheduled.
      expect(scheduleCalls,).toEqual(["chat-test-1",],);
    },
    10000,
  );

  test(
    "moodShiftDelta failure also does not strand the message",
    async () => {
      const appendCalls: string[] = [];
      const signalDone = { count: 0, };
      const scheduleCalls: string[] = [];
      const d = makeDeps(appendCalls, signalDone, scheduleCalls,);

      // Force MoodService.applyHappinessDelta to throw by passing a closed DB.
      const closedDb = db;
      try {
        await closedDb.destroy();
      } catch {
        /* already destroyed */
      }

      await expect(
        applyPostStoreEffects({
          d,
          database: closedDb,
          config: {} as never,
          chatId: "chat-test-2",
          userId: "user-1",
          actorId: "actor-1",
          actorName: "Actor One",
          characterId: "actor-1",
          messageId: "msg-2",
          content: "Another long message body to avoid short-text short-circuits.",
          thinking: undefined,
          tokenUsage: { promptTokens: 1, completionTokens: 2, totalTokens: 3, },
          finishReason: "stop",
          moodShiftDelta: 0.5,
          worldId: null,
          attemptId: "attempt-2",
          resolvedModel: "m",
          resolvedProviderName: "p",
          isGroupChat: false,
          cascadeDepth: 0,
        },),
      ).resolves.toBeUndefined();

      // Mood block is already wrapped — verify completion still runs.
      expect(d.completeGeneration,).toHaveBeenCalledTimes(1,);
      expect(appendCalls.length,).toBeGreaterThan(0,);
      expect(signalDone.count,).toBe(1,);
    },
    10000,
  );
},);
