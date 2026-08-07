/**
 * Auto-generation orchestration.
 *
 * `triggerAutoGeneration` assembles the generation pipeline from cohesive
 * sibling steps: actor resolution, LLM call, content hooks, message storage,
 * and post-store effects.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import {
  CancelReason,
  CancelSource,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { isTelemetryEnabled, record, } from "../../telemetry/service";
import { callLlm, } from "./call-llm";
import { runContentHooks, } from "./content-hooks";
import { createDefaultDeps, type GenDeps, } from "./deps";
import { applyPostStoreEffects, } from "./post-store";
import { prepareGeneration, } from "./prepare-generation";
import { resolveActor, } from "./resolve-actor";
import { resolveMode, } from "./resolve-mode";
import { storeMessage, } from "./store-message";

export interface AutoGenOpts {
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  /** null for initial greeting (no parent message) */
  parentMessageId: string | null;
  /** The user who triggered generation (userId) — used to resolve provider keys */
  userId: string;
  /** The user's message text — used for group-chat turn selection */
  userMessage?: string;
  /**
   * Internal: current cascade depth (set by triggerGroupCascade).
   * When set, the actor to generate as is taken from _cascadeActorId
   * instead of calling selectNextGroupActor.
   */
  _cascadeDepth?: number;
  /**
   * Internal: specific actor ID to generate as (used during cascade).
   * When set, overrides the normal turn-selection logic.
   */
  _cascadeActorId?: string;
  /** Injectable dependencies — omit for production (uses real implementations). */
  deps?: Partial<GenDeps>;
  /** Request ID from HTTP middleware for traceability through the generation pipeline. */
  requestId?: string;
}

/**
 * Generate and store a single LLM response for a chat.
 *
 * When `parentMessageId` is non-null, full generation tracking is used
 * (streaming SSE, abort signals, attempt row in DB). When null (initial
 * greeting), generation runs directly without an attempt row to avoid
 * the NOT NULL FK constraint on `generation_attempts.parent_message_id`.
 */
export async function triggerAutoGeneration(opts: AutoGenOpts,): Promise<void> {
  const { database, config, chatId, parentMessageId, userId, userMessage, } = opts;
  const cascadeDepth = opts._cascadeDepth ?? 0;
  const cascadeActorId = opts._cascadeActorId;
  const requestId = opts.requestId;
  const d = { ...createDefaultDeps(), ...opts.deps, };
  if (
    d.listProviders().length === 0 && !config.generation.defaultProvider &&
    config.generation.providers.openaiCompatible.length === 0
  ) { return; }

  const log = getLogger().child({ module: "auto-gen", requestId, },);
  log.debug("generation pipeline start", { chatId, parentMessageId, userId, cascadeDepth, },);

  let attemptId: string | undefined;

  try {
    if (parentMessageId) {
      d.cancelGenerationByChat({
        db: database,
        chatId,
        reason: CancelReason.UserCancel,
        source: CancelSource.System,
        detail: "New auto-generation starting",
      },);
    }

    const chat = await database
      .selectFrom("chats",)
      .select(["type", "turn_strategy", "mode", "gm_config", "world_id", "streaming",],)
      .where("id", "=", chatId,)
      .executeTakeFirst();

    const mode = await resolveMode({
      d,
      database,
      config,
      chatId,
      parentMessageId,
      userId,
      chat,
    },);
    if (mode.handled) { return; }
    const { systemPromptOverride, } = mode;

    const actor = await resolveActor(database, {
      type: chat?.type,
      cascadeActorId,
      userMessage,
      chatId,
      userId,
    },);
    if (!actor) { return; }
    const { characterId, characterName, } = actor;

    const prepared = await prepareGeneration({
      d,
      database,
      config,
      chatId,
      parentMessageId,
      userId,
      actorId: characterId,
      isGroupChat: chat?.type === "group",
      userMessage,
      systemPromptOverride,
    },);
    const { resolved, prompt, tracking, } = prepared;
    if (parentMessageId && tracking) { attemptId = tracking.attemptId; }

    const actorName = characterName;
    const lastMsg = prompt.messages[prompt.messages.length - 1];

    log.info("LLM request", {
      model: resolved.resolvedModel,
      provider: resolved.resolvedProviderName,
      messageCount: prompt.messages.length,
      lastRole: lastMsg?.role,
      lastContentPreview: lastMsg?.content?.slice(0, 200,),
    },);

    const llm = await callLlm({
      d,
      database,
      config,
      chatId,
      parentMessageId,
      userMessage,
      resolved,
      prompt,
      tracking,
      actorName,
      chatStreaming: chat?.streaming,
      requestId,
    },);

    const hooks = await runContentHooks({
      database,
      config,
      chatId,
      actorId: characterId,
      userId,
      content: llm.content,
    },);
    if (!hooks.allowed) { return; }

    const stored = await storeMessage({
      d,
      database,
      config,
      chatId,
      actorId: characterId,
      parentMessageId,
      content: llm.content,
      resolved,
      tokenUsage: llm.tokenUsage,
      dominantEmotion: hooks.dominantEmotion,
    },);
    log.debug("message stored", { messageId: stored.messageId, contentLength: llm.content.length, requestId, },);

    await applyPostStoreEffects({
      d,
      database,
      config,
      chatId,
      userId,
      actorId: characterId,
      actorName,
      messageId: stored.messageId,
      content: llm.content,
      thinking: llm.thinking,
      tokenUsage: llm.tokenUsage,
      finishReason: llm.finishReason,
      moodShiftDelta: hooks.moodShiftDelta,
      worldId: chat?.world_id,
      attemptId,
      resolvedModel: resolved.resolvedModel,
      resolvedProviderName: resolved.resolvedProviderName,
      isGroupChat: chat?.type === "group",
      cascadeDepth,
      deps: opts.deps,
    },);
  } catch (error) {
    if (attemptId) {
      try {
        await d.failGeneration({ attemptId, error: error as Error, db: database, },);
      } catch {}
    }
    // Record generation failure telemetry
    if (isTelemetryEnabled()) {
      void record(database, {
        eventType: "generation.failed",
        userId,
        chatId,
        data: {
          error: (error as Error).message,
          chatId,
        },
      },);
    }
    try {
      const buf = d.getOrCreateBuffer(chatId,);
      buf.signalError((error as Error).message,);
      d.scheduleBufferCleanup(chatId,);
    } catch {}

    const err = error instanceof Error ? error : new Error(String(error,),);
    const log = getLogger().child({ module: "auto-gen", },);
    if (
      err.name === "AbortError" ||
      err.message === "Request cancelled" ||
      err.message === "Request timed out"
    ) {
      log.warn("Auto-generation aborted", { reason: err.message, },);
    } else {
      log.error("Auto-generation failed", err,);
    }
  }
}
