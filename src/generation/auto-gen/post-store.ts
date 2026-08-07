/**
 * Post-store step for auto-generation.
 *
 * Applies mood-shift persistence, hallucination detection, completion
 * telemetry, generation-attempt completion, and the group-chat cascade after
 * the assistant message is stored.
 */
import type { Kysely, } from "kysely";
import { MoodService, } from "../../characters/services/mood-service";
import { detectHallucinations, } from "../../chat";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { isTelemetryEnabled, record, } from "../../telemetry/service";
import type { GenDeps, } from "./deps";
import { renderStreamMessage, } from "./stream-render";

export interface PostStoreOpts {
  d: GenDeps;
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  userId: string;
  actorId: string;
  actorName: string;
  /** The stored message ID (for the final buffer render). */
  messageId: string;
  content: string;
  thinking: string | undefined;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: "stop" | "length" | "error" | "cancelled";
  /** Mood-shift delta from the content hooks (undefined = none). */
  moodShiftDelta: number | undefined;
  /** World ID for mood/hallucination scoping. */
  worldId: string | null | undefined;
  /** Generation attempt ID (undefined for initial greeting). */
  attemptId: string | undefined;
  /** Resolved model/provider for telemetry + completion. */
  resolvedModel: string;
  resolvedProviderName: string;
  /** True for group chats (may cascade to the next actor). */
  isGroupChat: boolean;
  /** Current cascade depth. */
  cascadeDepth: number;
  /** Original partial deps passed to triggerAutoGeneration (for cascade). */
  deps?: Partial<GenDeps>;
}

/**
 * Apply post-store effects and finish the generation attempt.
 */
export async function applyPostStoreEffects(opts: PostStoreOpts,): Promise<void> {
  const {
    d,
    database,
    config,
    chatId,
    userId,
    actorId,
    actorName,
    messageId,
    content,
    thinking,
    tokenUsage,
    finishReason,
    moodShiftDelta,
    worldId,
    attemptId,
    resolvedModel,
    resolvedProviderName,
    isGroupChat,
    cascadeDepth,
    deps,
  } = opts;
  const log = getLogger().child({ module: "auto-gen", },);

  // ── Mood shift persistence ──────────────────────────────────
  // If the MoodHook detected a mood shift, apply its delta to the character's
  // world-scoped mood record so mood auto-tracks the conversation's tone.
  // Best-effort: a missing mood row (no-op) or a DB failure is logged, never
  // allowed to fail generation.
  if (moodShiftDelta != null) {
    try {
      await MoodService(database,).applyHappinessDelta(
        actorId,
        worldId ?? undefined,
        moodShiftDelta,
      );
    } catch (error) {
      log.warn("mood-hook: failed to persist mood shift", { err: error, },);
    }
  }

  // ── Hallucination guard ────────────────────────────────────────
  // Check generated content against known world entities
  const hallucinationAnalysis = await detectHallucinations({
    db: database,
    text: content,
    worldId: worldId ?? undefined,
  },);

  if (hallucinationAnalysis.detected) {
    log.warn("Hallucination detected in generation", {
      chatId,
      score: hallucinationAnalysis.score,
      flags: Array.from(hallucinationAnalysis.flags, (f,) => ({
        entity: f.entityName,
        type: f.entityType,
        confidence: f.confidence,
      }),),
    },);
  }
  // Record generation telemetry event
  if (isTelemetryEnabled()) {
    void record(database, {
      eventType: "generation.completed",
      userId,
      chatId,
      data: {
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
        totalTokens: tokenUsage.totalTokens,
        latencyMs: 0,
        model: resolvedModel,
        provider: resolvedProviderName,
        finishReason,
      },
    },);
  }

  if (attemptId) {
    await d.completeGeneration({
      attemptId,
      result: {
        content,
        tokenUsage,
        generationTimeMs: 0,
        cancelled: finishReason === "cancelled",
      },
      db: database,
    },);

    const buffer = d.getOrCreateBuffer(chatId,);
    buffer?.append(
      "stream-update",
      renderStreamMessage(actorName, content, attemptId, d.markedParse, {
        messageId,
        isFinal: true,
        thinking,
      },),
    );
    buffer?.signalDone();
    d.scheduleBufferCleanup(chatId,);
  }

  // ── Group chat cascade: trigger next AI turn if applicable ──
  if (isGroupChat && finishReason !== "cancelled") {
    // Fire-and-forget: cascade runs in background, errors logged internally
    void (async () => {
      try {
        await d.triggerGroupCascade!({
          database,
          config,
          chatId,
          userId,
          aiContent: content,
          previousActorId: actorId,
          depth: cascadeDepth,
          deps,
        },);
      } catch {
        /* errors logged inside triggerGroupCascade */
      }
    })();
  }
}
