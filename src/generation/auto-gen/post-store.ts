// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Post-store step for auto-generation.
 *
 * Applies mood-shift persistence, hallucination detection, completion
 * telemetry, generation-attempt completion, and the group-chat cascade after
 * the assistant message is stored.
 *
 * BUG-generation-error-handling-gaps-detector-abort-void-promises:
 * Telemetry `record()` void calls gain explicit `.catch(…)` so a DB outage
 * during telemetry does not produce an unhandled rejection that crashes the
 * post-store call site.
 */
import type { Kysely, } from "kysely";
import { MoodService, } from "../../characters/services/mood-service";
import { detectHallucinations, } from "../../chat";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { isTelemetryEnabled, record, } from "../../telemetry/service";
import type { GenDeps, } from "./deps";
import { fireRandomEvent, } from "./fire-random-event";
import { resolveChatKnownEntityNames, } from "./resolve-known-names";
import { renderStreamMessage, } from "./stream-render";

/** */
export interface PostStoreOpts {
  d: GenDeps;
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  userId: string;
  actorId: string;
  actorName: string;
  /**
   * Server-resolved character ID of the generating character. Used for the
   * mood delta write (BUG-bug-auto-generation-applies-mood-delta-to-hook-payload-actor).
   * May equal `actorId` for 1:1 chats, but in group chats `actorId` may carry
   * a hook-resolved mention target while the generating character's mood is
   * what should be updated.
   */
  characterId: string;
  /** The stored message ID (for the final buffer render). */
  messageId: string;
  content: string;
  thinking: undefined | string;
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
 * @param opts
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
    characterId,
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

  if (moodShiftDelta != null) {
    try {
      await MoodService(database,).applyHappinessDelta(
        characterId,
        worldId ?? undefined,
        moodShiftDelta,
      );
    } catch (error) {
      log.warn("mood-hook: failed to persist mood shift", { err: error, },);
    }
  }

  let hallucinationAnalysis: {
    detected: boolean;
    score: number;
    flags: readonly { entityName: string; entityType: string; confidence: number }[];
  };
  try {
    // Resolve chat-scoped known entity names (participants + current
    // location) so the detector does not flag them as hallucinations.
    // BUG-hallucination-guard-isKnownEntity-stubs-unused — reuses the
    // existing knownEntityNames pathway instead of populating the unused
    // _knownActorIds/_knownLocationIds stubs in isKnownEntity.
    const knownEntityNames = await resolveChatKnownEntityNames(database, chatId,);
    hallucinationAnalysis = await detectHallucinations({
      db: database,
      text: content,
      worldId: worldId ?? undefined,
      knownEntityNames,
    },);
  } catch (error) {
    log.warn("hallucination-guard: failed to detect hallucinations", { err: error, },);
    hallucinationAnalysis = { detected: false, score: 0, flags: [], };
  }

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

  if (isTelemetryEnabled()) {
    // BUG-generation-error-handling-gaps: .catch keeps the void promise
    // from becoming an unhandled rejection if the telemetry DB is down.
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
    },).catch((error: unknown,) => {
      log.error("Telemetry record failed", error instanceof Error ? error : undefined,);
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

  if (worldId) {
    try {
      // Random ambient events: generate + persist for the next prompt build.
      // fireRandomEvent handles message-count cooldown tracking, participant/
      // location lookup, generation, and chat_random_events upsert.
      const fired = await fireRandomEvent(database, chatId,);
      if (fired) {
        log.debug("random event generated + persisted", {
          chatId,
          eventId: fired.event.id,
          category: fired.event.category,
          content: fired.event.content.slice(0, 100,),
          tokenCount: fired.eventRef.tokenCount,
        },);
      }
    } catch (error) {
      log.warn("random event generation failed (non-fatal)", { err: error, },);
    }
  }

  if (isGroupChat && finishReason !== "cancelled") {
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
      } catch (error) {
        // Surface cascade errors via the structured logger instead of
        // emitting a silent rejection. The cascade itself already logs
        // per-depth failures; this is the outer safety net for the
        // fire-and-forget wrapper (BUG-group-cascade-mid-cascade-pause-
        // ignored — empty catch masked pause-toggled-during-cascade).
        log.error(
          "triggerGroupCascade failed (outer wrapper)",
          error instanceof Error ? error : new Error(String(error,),),
          { chatId, cascadeDepth, },
        );
      }
    })();
  }
}
