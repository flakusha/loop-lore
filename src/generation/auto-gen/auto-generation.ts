// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Auto-generation orchestration.
 *
 * `triggerAutoGeneration` assembles the generation pipeline from cohesive
 * sibling steps: actor resolution, LLM call, content hooks, message storage,
 * and post-store effects.
 */
import type { Kysely, } from "kysely";
import type { AsyncStore, } from "../../async/store";
import type { Config, } from "../../config/schema";
import { CancelReason, CancelSource, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { callLlm, } from "./call-llm";
import { checkNsfwEligibility, runContentHooks, } from "./content-hooks";
import { checkAndPruneContext, } from "./context-pruning";
import { createDefaultDeps, type GenDeps, } from "./deps";
import { handleGenerationError, } from "./handle-generation-error";
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
  /** Async request-result store — when set, emits progress/fail updates. */
  asyncStore?: AsyncStore;
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
  const asyncStore = opts.asyncStore;
  const d = { ...createDefaultDeps(), ...opts.deps, };
  if (
    d.listProviders().length === 0 && !config.generation.defaultProvider &&
    config.generation.providers.openaiCompatible.length === 0
  ) { return; }

  const log = getLogger().child({ module: "auto-gen", requestId, },);
  log.debug("generation pipeline start", { chatId, parentMessageId, userId, cascadeDepth, },);

  // Emit a named progress step to the async store (when one is wired),
  // emitting progress updates for the status endpoint.
  const emitProgress = (step: string,): void => {
    if (asyncStore && requestId) { asyncStore.progress(requestId, { progress: { step, }, },); }
  };

  let attemptId: string | undefined;

  try {
    emitProgress("preparing",);

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

    // Pre-LLM NSFW eligibility precheck (BUG-f0683a8 / BUG-5232abe). Block
    // BEFORE spending tokens on generation for users who would be blocked
    // anyway. runContentHooks runs the same check post-LLM as defense-in-depth.
    const nsfwEligibility = await checkNsfwEligibility({
      database,
      config,
      actorId: characterId,
      userId,
      chatId,
    },);
    if (!nsfwEligibility.allowed) {
      log.info("auto-gen: blocked before generation by NSFW precheck", {
        chatId,
        actorId: characterId,
        userId,
        reason: nsfwEligibility.reason,
      },);
      return;
    }

    // ── Context pruning (critical/imminent threshold) ───────
    // When the context window is critically full, prune low-value messages
    // before assembling the prompt. High-importance messages are promoted
    // to memory so their content survives removal.
    await checkAndPruneContext(database, chatId, requestId,);

    const prepared = await prepareGeneration({
      d,
      database,
      config,
      chatId,
      parentMessageId,
      userId,
      actorId: characterId,
      isGroupChat: chat?.type === "group",
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

    emitProgress("generating",);
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

    emitProgress("storing",);
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
      thinking: llm.thinking,
    },);
    log.debug("message stored", { messageId: stored.messageId, contentLength: llm.content.length, requestId, },);

    await applyPostStoreEffects({
      d,
      database,
      config,
      chatId,
      userId,
      actorId: hooks.actorId ?? characterId,
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
    if (asyncStore && requestId) { asyncStore.fail(requestId, String(error,),); }
    await handleGenerationError(error, database, d, chatId, userId, attemptId,);
  }
}
