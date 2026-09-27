// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests for LLM execution-stats telemetry fields.
 *
 * BUG-generation-completed-latencyms-hardcoded-to-0-on-two-emit-pa:
 * post-store `generation.completed` must carry measured wall-clock
 * latencyMs (Date.now() - startedAtMs), not 0.
 *
 * BUG-generation-failed-drops-model-provider-context:
 * `generation.failed` must carry model/provider when the caller knows them.
 *
 * No mock.module here on purpose: these tests hit the real telemetry sink
 * so they run in every gate (plain `bun test src/`, --isolate, coverage).
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { isTelemetryEnabled, } from "../../telemetry/service";
import type { GenDeps, } from "./deps";
import { handleGenerationError, } from "./handle-generation-error";
import { applyPostStoreEffects, } from "./post-store";

createLogger({ level: "error", },);

const runOrSkip = isTelemetryEnabled() ? describe : describe.skip;

/**
 * `record()` is fire-and-forget at the call sites; yield one macrotask so
 * the insert lands before we read it back.
 */
async function drainTelemetry(): Promise<void> {
  await new Promise<void>((resolve,) => setTimeout(resolve, 25,),);
}

/**
 * @param db
 * @param eventType
 */
async function soleEventData(db: Kysely<DB>, eventType: string,): Promise<Record<string, unknown>> {
  const rows = await db.selectFrom("telemetry_events",).select("event_data",)
    .where("event_type", "=", eventType,).execute();
  expect(rows.length,).toBe(1,);
  return JSON.parse(rows[0]!.event_data,) as Record<string, unknown>;
}

function bufferDeps(): GenDeps {
  return {
    getOrCreateBuffer: (() => ({
      signalError: () => {},
      signalDone: () => {},
      append: () => 0,
      subscribe: () => () => {},
      replay: () => [],
    })) as unknown as GenDeps["getOrCreateBuffer"],
    scheduleBufferCleanup: (() => {}) as unknown as GenDeps["scheduleBufferCleanup"],
  } as unknown as GenDeps;
}

runOrSkip("generation telemetry fields", () => {
  test("post-store records measured latencyMs, not 0", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await applyPostStoreEffects({
        d: {} as unknown as GenDeps,
        database: db,
        config: {} as never,
        chatId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        actorId: "actor-1",
        actorName: "Actor",
        characterId: "actor-1",
        messageId: "msg-1",
        content: "Hello world, this message is long enough to analyze for entities.",
        thinking: undefined,
        tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, },
        finishReason: "stop",
        moodShiftDelta: undefined,
        worldId: undefined,
        attemptId: undefined,
        startedAtMs: Date.now() - 1500,
        resolvedModel: "latency-model",
        resolvedProviderName: "latency-provider",
        isGroupChat: false,
        cascadeDepth: 0,
      },);
      await drainTelemetry();
      const data = await soleEventData(db, "generation.completed",);
      expect(data["model"],).toBe("latency-model",);
      expect(data["latencyMs"] as number,).toBeGreaterThanOrEqual(1000,);
    } finally {
      sqlite.close();
    }
  },);

  test("failed generation carries model + provider", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await handleGenerationError(
        new Error("boom",),
        db,
        bufferDeps(),
        crypto.randomUUID(),
        crypto.randomUUID(),
        undefined,
        { model: "fail-model", provider: "fail-provider", },
      );
      await drainTelemetry();
      const data = await soleEventData(db, "generation.failed",);
      expect(data["model"],).toBe("fail-model",);
      expect(data["provider"],).toBe("fail-provider",);
    } finally {
      sqlite.close();
    }
  },);

  test("failed generation without context keeps the old shape", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await handleGenerationError(
        new Error("boom",),
        db,
        bufferDeps(),
        crypto.randomUUID(),
        crypto.randomUUID(),
        undefined,
      );
      await drainTelemetry();
      const data = await soleEventData(db, "generation.failed",);
      expect("model" in data,).toBe(false,);
      expect("provider" in data,).toBe(false,);
    } finally {
      sqlite.close();
    }
  },);
});
