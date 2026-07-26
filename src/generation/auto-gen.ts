// src/generation/auto-gen.ts
//
// Shared auto-generation logic — called when a user message is posted and
// when a new chat is created (initial greeting). Extracted from routes/
// so both messages.ts and chats.ts can trigger generation without
// duplicating the orchestration logic.
//
// Group chat cascade: after an AI response is saved, the system checks for
// @mentions in the content and auto-triggers the next character's turn.
// Controlled by `chats.max_turns` (max cascade depth) and `chats.auto_advance`
// (1 = auto-advance without needing @mentions).

import type { Kysely, } from "kysely";
import { marked, } from "marked";
import { resolveModelRole, } from "../admin/model-roles";
import { PromptAssembler, } from "../assistant/prompt-assembler";
import { detectHallucinations, } from "../chat";
import type { Config, } from "../config/schema";
import { compressThenEncrypt, deriveChatKeyForChat, getSmk, isEncryptionEnabled, } from "../crypto";
import {
  CancelReason,
  CancelSource,
  ChunkAction,
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../db/enums";
import type { DB, } from "../db/schema";
import { extractMentionedActorIds, } from "../group-chat/mention-parser";
import { selectNextGroupActor, } from "../group-chat/turn-selector";
import { getLogger, } from "../logger";
import { type GameMasterConfig, GameMasterService, } from "../story";
import type { GenerateTextFn, } from "../story/game-master";
import { jsonParseOr, uid, } from "../utils";
import { getRegisteredHooks, runHookChain, } from "./hooks";
import type { HookEventType, } from "./hooks";
import {
  cancelGenerationByChat,
  completeGeneration,
  failGeneration,
  getOrCreateBuffer,
  processStreamingChunk,
  scheduleBufferCleanup,
  startGenerationTracking,
} from "./index";
import {
  buildFailoverList,
  callWithFailover,
  getProvider,
  listProviders,
  resolveProvider,
} from "./providers/registry";
import type { ChunkEvent, } from "./providers/types";
import { applyRegexTransforms, } from "./transforms";


// ── Dependency Injection ────────────────────────────────────────
//
// All external module calls are routed through GenDeps so tests can
// inject mocks without using Bun's mock.module (which leaks across
// test files in the same process).

/** Injectable dependencies for generation functions. */
export interface GenDeps {
  cancelGenerationByChat: typeof cancelGenerationByChat;
  completeGeneration: typeof completeGeneration;
  failGeneration: typeof failGeneration;
  getOrCreateBuffer: typeof getOrCreateBuffer;
  scheduleBufferCleanup: typeof scheduleBufferCleanup;
  startGenerationTracking: typeof startGenerationTracking;
  resolveProvider: typeof resolveProvider;
  listProviders: typeof listProviders;
  isEncryptionEnabled: () => boolean;
  getSmk: () => CryptoKey | null;
  deriveChatKeyForChat: typeof deriveChatKeyForChat;
  compressThenEncrypt: typeof compressThenEncrypt;
  markedParse: (src: string, opts?: Record<string, unknown>,) => string;
  createPromptAssembler: (db: Kysely<DB>,) => PromptAssembler;
  /** Self-references for recursive calls (set automatically). */
  triggerAutoGeneration?: (opts: AutoGenOpts,) => Promise<void>;
  triggerGroupCascade?: (opts: GroupCascadeOpts,) => Promise<void>;
}

/** Return the real production implementations. */
export function createDefaultDeps(): GenDeps {
  return {
    cancelGenerationByChat,
    completeGeneration,
    failGeneration,
    getOrCreateBuffer,
    scheduleBufferCleanup,
    startGenerationTracking,
    resolveProvider,
    listProviders,
    isEncryptionEnabled,
    getSmk,
    deriveChatKeyForChat,
    compressThenEncrypt,
    markedParse: (src, opts?,) => marked.parse(src, opts ?? {},) as string,
    createPromptAssembler: (db,) => new PromptAssembler(db,),
    triggerAutoGeneration,
    triggerGroupCascade,
  };
}

/**
 * Pre-generation intent check using the auxiliary model.
 *
 * Sends a lightweight classification prompt to the auxiliary model
 * to determine message intent before committing to full generation.
 * Returns null if no auxiliary model is configured or on error.
 */
export interface IntentClassification {
  intent: string;
  confidence: number;
  shortReply: boolean;
}

export async function classifyIntent(
  userMessage: string,
  config: Config,
  db: Kysely<DB>,
): Promise<IntentClassification | null> {
  try {
    const auxRole = await resolveModelRole("auxiliary", config, db,);
    if (!auxRole.provider || !auxRole.model) { return null; }

    const auxProvider = getProvider(auxRole.provider,);
    if (!auxProvider) { return null; }

    const classificationPrompt = [
      {
        role: "system" as const,
        content:
          'Classify the user message intent. Reply with ONLY a JSON object: {"intent": "greeting|question|command|roleplay|narrative", "confidence": 0.0-1.0, "shortReply": true/false}. shortReply=true for greetings, simple questions, short commands. shortReply=false for roleplay, narrative, complex requests.',
      },
      { role: "user" as const, content: userMessage.slice(0, 500,), },
    ];

    const response = await auxProvider.complete({
      model: auxRole.model,
      messages: classificationPrompt,
      params: { temperature: 0.1, maxTokens: 100, },
    },);

    const parsed = jsonParseOr<Partial<IntentClassification>>(response.content, {},);
    if (!parsed.intent) { return null; }

    return {
      intent: parsed.intent,
      confidence: parsed.confidence ?? 0.5,
      shortReply: parsed.shortReply ?? false,
    };
  } catch {
    // Auxiliary model unavailable — proceed with main generation
    return null;
  }
}
export function isLlmGenerationConfigured(config: Config,): boolean {
  return (
    !!config.generation.defaultProvider ||
    config.generation.providers.openaiCompatible.length > 0 ||
    listProviders().length > 0
  );
}

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

    // ── Story mode: use GameMasterService for full GM orchestration ──
    if (chat?.mode === "story") {
      await triggerStoryModeGeneration({
        database,
        config,
        chatId,
        parentMessageId,
        userId,
        gmConfig: chat.gm_config,
        worldId: chat.world_id,
        deps: d,
      },);
      return;
    }

    let characterId: string;
    let characterName: string;

    if (chat?.type === "group") {
      if (cascadeActorId) {
        // Cascade mode: use the pre-selected actor
        characterId = cascadeActorId;
        const selected = await database
          .selectFrom("actors",)
          .select(["display_name",],)
          .where("id", "=", characterId,)
          .executeTakeFirst();
        characterName = selected?.display_name ?? "Unknown";
      } else {
        const selectedId = await selectNextGroupActor({ db: database, chatId, userMessage, },);
        if (!selectedId) { return; }
        const selected = await database
          .selectFrom("actors",)
          .select(["display_name",],)
          .where("id", "=", selectedId,)
          .executeTakeFirst();
        if (!selected) { return; }
        characterId = selectedId;
        characterName = selected.display_name;
      }
    } else {
      const character = await database
        .selectFrom("chat_participants",)
        .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
        .where("chat_participants.chat_id", "=", chatId,)
        .where("chat_participants.actor_id", "!=", userId,)
        .select(["actors.id", "actors.display_name",],)
        .executeTakeFirst();
      if (!character) { return; }
      characterId = character.id;
      characterName = character.display_name;
    }

    const resolved = await d.resolveProvider({ userId, config, db: database, },);
    log.debug("provider resolved", { provider: resolved.resolvedProviderName, model: resolved.resolvedModel, },);
    const assembler = d.createPromptAssembler(database,);

    let groupParticipantIds: string[] | undefined;
    if (chat?.type === "group") {
      const participants = await database
        .selectFrom("chat_participants",)
        .select(["actor_id",],)
        .where("chat_id", "=", chatId,)
        .execute();
      groupParticipantIds = participants.map((p,) => p.actor_id).filter((id,) => id !== characterId);
    }

    const prompt = await assembler.assemble({
      actorId: characterId,
      chatId,
      modelId: resolved.resolvedModel,
      groupParticipantIds,
      avatarConfig: config.templates?.avatar ?? {},
    },);
    log.debug("prompt assembled", { messageCount: prompt.messages.length, },);

    // For initial greeting (no parentMessageId), skip generation tracking
    // to avoid NOT NULL FK constraint on generation_attempts.parent_message_id.
    let tracking: { attemptId: string; abortSignal: AbortSignal } | undefined;
    if (parentMessageId) {
      tracking = await d.startGenerationTracking({
        options: {
          chatId,
          parentMessageId,
          actorId: characterId,
          modelId: resolved.resolvedModel,
          provider: resolved.resolvedProviderName,
          prompt: prompt.messages,
          idempotencyKey: uid(),
        },
        db: database,
      },);
      attemptId = tracking.attemptId;
    }

    const actorName = characterName;
    const lastMsg = prompt.messages[prompt.messages.length - 1];

    log.info("LLM request", {
      model: resolved.resolvedModel,
      provider: resolved.resolvedProviderName,
      messageCount: prompt.messages.length,
      lastRole: lastMsg?.role,
      lastContentPreview: lastMsg?.content?.slice(0, 200,),
    },);

    // ── Auxiliary model intent classification ────────────────────
    // Use lightweight model to classify intent and adjust generation params
    let maxTokens = 2048;
    if (userMessage) {
      const intent = await classifyIntent(userMessage, config, database,);
      if (intent?.shortReply && intent.confidence > 0.7) {
        maxTokens = 512;
        log.info("Auxiliary model: short reply detected", {
          intent: intent.intent,
          confidence: intent.confidence,
          maxTokens,
        },);
      }
    }

    let accumulatedContent = "";
    let accumulatedThinking: string | undefined;
    let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, };
    let finishReason: "stop" | "length" | "error" | "cancelled" = "stop";
    // Resolution chain: chat.streaming → config.defaultStream → provider capability
    const chatStreaming = chat?.streaming;
    const configDefault = config.generation.defaultStream;
    const providerCapable = resolved.provider.capabilities.streaming;
    const canStream = chatStreaming === 1 ||
      (chatStreaming == null && configDefault === true) ||
      (chatStreaming == null && configDefault == null && providerCapable);
    const buffer = parentMessageId ? d.getOrCreateBuffer(chatId,) : undefined;

    // Build failover list: primary provider first, then all others
    const failoverList = d.buildFailoverList(resolved.resolvedProviderName, config,);
    log.debug("calling LLM", { streaming: canStream, failoverCount: failoverList.length, requestId, },);
    const genReq = {
      model: resolved.resolvedModel,
      messages: prompt.messages,
      apiKey: resolved.resolvedApiKey,
      params: { temperature: 0.9, maxTokens, },
      signal: tracking?.abortSignal,
    };

    if (canStream) {
      const finalResponse = await d.callWithFailover(
        failoverList,
        genReq,
        (chunk: ChunkEvent,) => {
          if (chunk.type === "content" && chunk.content) {
            accumulatedContent += chunk.content;
            // Feed chunk to repetition/policy detector
            void processStreamingChunk({ attemptId: tracking?.attemptId ?? "", chunk: chunk.content, db: database, },)
              .then((action,) => {
                if (action !== ChunkAction.Continue) {
                  // Detector triggered cancel — abort the stream
                  tracking?.abortSignal?.throwIfAborted();
                }
              },);
            buffer?.append(
              "stream-update",
              renderStreamMessage(actorName, accumulatedContent, tracking?.attemptId ?? "", d.markedParse, {
                thinking: accumulatedThinking,
              },),
            );
          } else if (chunk.type === "thinking" && chunk.content) {
            accumulatedThinking = (accumulatedThinking ?? "") + chunk.content;
          }
        },
      );
      tokenUsage = {
        promptTokens: finalResponse.usage.promptTokens,
        completionTokens: finalResponse.usage.completionTokens,
        totalTokens: finalResponse.usage.totalTokens,
      };
      finishReason = finalResponse.finishReason;
    } else {
      const response = await d.callWithFailover(failoverList, genReq,);
      accumulatedContent = response.content;
      accumulatedThinking = response.thinking;
      tokenUsage = {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      };
      finishReason = response.finishReason;
      buffer?.append(
        "stream-update",
        renderStreamMessage(actorName, accumulatedContent, tracking?.attemptId ?? "", d.markedParse, {
          thinking: accumulatedThinking,
        },),
      );
    }

    log.info("LLM response", { contentLength: accumulatedContent.length, finishReason, ...tokenUsage, },);

    // Fetch actor NSFW policy for hook gating
    const availability = await database
      .selectFrom("character_availability",)
      .select(["nsfw_policy",],)
      .where("actor_id", "=", characterId,)
      .executeTakeFirst();
    const nsfwPolicy = availability?.nsfw_policy
      ? (JSON.parse(availability.nsfw_policy,) as Record<string, unknown>).level as string | undefined
      : undefined;

    // Determine which hook event types to run based on config
    const hooksConfig = config.hooks ?? {
      enableMoodHooks: true,
      enableEmotionHooks: true,
      enableNsfwHooks: true,
      enableModerationHooks: true,
    };
    const enabledEventTypes: HookEventType[] = [];
    if (hooksConfig.enableMoodHooks) { enabledEventTypes.push("mood_shift",); }
    if (hooksConfig.enableEmotionHooks) { enabledEventTypes.push("emotion_change",); }
    if (hooksConfig.enableNsfwHooks) { enabledEventTypes.push("nsfw_gate", "privacy_check",); }
    if (hooksConfig.enableModerationHooks) { enabledEventTypes.push("moderation_flag",); }

    // Run content hooks (mood, emotion, NSFW, moderation) before storing
    log.debug("running content hooks", { eventTypes: enabledEventTypes, },);
    const hookResult = await runHookChain({
      hooks: [...getRegisteredHooks(),],
      context: {
        chatId,
        actorId: characterId,
        userId,
        content: accumulatedContent,
        nsfwPolicy,
        privacyLevel: "standard",
        eventTypes: enabledEventTypes,
        config,
        nsfwConfig: config.nsfw ?? { allowNsfw: false, nsfwMinAge: 0, },
        db: database,
      },
    },);

    if (!hookResult.allowed) {
      log.warn("Generation blocked by content hooks", {
        reason: hookResult.events.map((e,) => e.reason).join("; ",),
      },);
      return;
    }

    // ── Regex Output Transforms ──────────────────────────────────
    // Apply user-configured regex transforms to LLM output before storage
    const regexTransforms = config.generation.regexTransforms;
    if (regexTransforms && regexTransforms.length > 0) {
      const transformResult = applyRegexTransforms(accumulatedContent, regexTransforms,);
      if (transformResult.applied.length > 0) {
        log.debug("regex transforms applied", {
          transforms: transformResult.applied.map((t,) => ({ name: t.name, matches: t.matches, })),
        },);
        accumulatedContent = transformResult.text;
      }
    }

    const messageId = uid();
    const maxSwipe = parentMessageId
      ? await database
        .selectFrom("messages",)
        .select(database.fn.max("swipe_index",).as("max_idx",),)
        .where("chat_id", "=", chatId,)
        .where("parent_id", "=", parentMessageId,)
        .executeTakeFirst()
      : undefined;
    const swipeIndex = parentMessageId ? (maxSwipe?.max_idx ?? 0) + 1 : null;

    let storedContent: string = accumulatedContent;
    let storedKeyId: string | null = null;
    const contentEncoding = ContentEncoding.Identity;
    if (d.isEncryptionEnabled()) {
      const smk = d.getSmk()!;
      const chatKey = await d.deriveChatKeyForChat(database, chatId, smk,);
      storedContent = await d.compressThenEncrypt({
        plaintext: accumulatedContent,
        chatKey: chatKey.key,
        keyId: chatKey.keyId,
        config: {
          threshold: config.encryption.compressThreshold,
          algorithm: config.encryption.compressAlgorithm,
        },
      },);
      storedKeyId = chatKey.keyId;
    }

    await database
      .insertInto("messages",)
      .values({
        id: messageId,
        chat_id: chatId,
        actor_id: characterId,
        parent_id: parentMessageId,
        role: MessageRole.Assistant,
        content: storedContent,
        key_id: storedKeyId,
        content_type: MessageContentType.Text,
        content_format: MessageContentFormat.Markdown,
        content_encoding: contentEncoding,
        model_id: resolved.resolvedModel,
        provider: resolved.resolvedProviderName,
        token_count_prompt: tokenUsage.promptTokens,
        token_count_completion: tokenUsage.completionTokens,
        token_count_total: tokenUsage.totalTokens,
        status: MessageStatus.Confirmed,
        visibility: MessageVisibility.Visible,
        swipe_index: swipeIndex,
      },)
      .execute();
    log.debug("message stored", { messageId, contentLength: accumulatedContent.length, requestId, },);

    // ── Hallucination guard ────────────────────────────────────────
    // Check generated content against known world entities
    const hallucinationAnalysis = await detectHallucinations({
      db: database,
      text: accumulatedContent,
      worldId: chat?.world_id ?? undefined,
    },);

    if (hallucinationAnalysis.detected) {
      log.warn("Hallucination detected in generation", {
        chatId,
        score: hallucinationAnalysis.score,
        flags: hallucinationAnalysis.flags.map((f,) => ({
          entity: f.entityName,
          type: f.entityType,
          confidence: f.confidence,
        })),
      },);
    }

    if (attemptId) {
      await d.completeGeneration({
        attemptId,
        result: {
          content: accumulatedContent,
          tokenUsage,
          generationTimeMs: 0,
          cancelled: finishReason === "cancelled",
        },
        db: database,
      },);

      buffer?.append(
        "stream-update",
        renderStreamMessage(actorName, accumulatedContent, tracking!.attemptId, d.markedParse, {
          messageId,
          isFinal: true,
          thinking: accumulatedThinking,
        },),
      );
      buffer?.signalDone();
      d.scheduleBufferCleanup(chatId,);
    }

    // ── Group chat cascade: trigger next AI turn if applicable ──
    if (chat?.type === "group" && finishReason !== "cancelled") {
      // Fire-and-forget: cascade runs in background, errors logged internally
      d.triggerGroupCascade!({
        database,
        config,
        chatId,
        userId,
        aiContent: accumulatedContent,
        previousActorId: characterId,
        depth: cascadeDepth,
        deps: opts.deps,
      },).catch(() => {
        /* errors logged inside triggerGroupCascade */
      },);
    }
  } catch (error) {
    if (attemptId) {
      try {
        await d.failGeneration({ attemptId, error: error as Error, db: database, },);
      } catch {}
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

// ── Group Chat Multi-Turn Cascade ──────────────────────────────

/**
 * Options for group chat cascade generation.
 */
export interface GroupCascadeOpts {
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  userId: string;
  /** The just-saved AI message content (plaintext, before encryption) */
  aiContent: string;
  /** The actor ID that just generated (to exclude from next turn) */
  previousActorId: string;
  /** Current cascade depth (0 = first AI response after user message) */
  depth: number;
  /** Injectable dependencies — omit for production (uses real implementations). */
  deps?: Partial<GenDeps>;
}

/**
 * After an AI response in a group chat, check if cascade should continue.
 *
 * Cascade triggers when:
 * - `auto_advance` is set on the chat (turns cascade without needing @mentions), OR
 * - The AI response contains @mentions of other participants
 *
 * Cascade stops when:
 * - `max_turns` is reached (default: 3, 0 = no cascade)
 * - No @mentions found and `auto_advance` is off
 * - The chat is paused
 * - No eligible AI participants remain
 * - An error occurs
 */
export async function triggerGroupCascade(opts: GroupCascadeOpts,): Promise<void> {
  const { database, config, chatId, userId, aiContent, previousActorId, depth, } = opts;
  const d = { ...createDefaultDeps(), ...opts.deps, };
  const log = getLogger().child({ module: "auto-gen-cascade", },);

  // Fetch chat cascade config
  const chat = await database
    .selectFrom("chats",)
    .select(["max_turns", "auto_advance", "story_state",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) { return; }

  const maxTurns = chat.max_turns ?? 3;
  const autoAdvance = (chat.auto_advance ?? 0) > 0;

  // Depth check: max_turns=0 means no cascade, max_turns=1 means 1 AI reply per user message
  if (maxTurns === 0) { return; }
  if (depth >= maxTurns) {
    log.debug("Cascade depth limit reached", { depth, maxTurns, },);
    return;
  }

  // Check if paused
  if (chat.story_state) {
    const state = jsonParseOr<{ isPaused?: boolean }>(chat.story_state, {},);
    if (state.isPaused) {
      log.debug("Chat paused, cascade stopped",);
      return;
    }
  }

  // Get all AI participants
  const participants = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["chat_participants.actor_id", "actors.actor_type", "actors.agent_type", "actors.display_name",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("actors.agent_type", "!=", "none",)
    .execute();

  const aiParticipants = participants.filter((p,) => p.actor_type !== "user");
  if (aiParticipants.length === 0) { return; }

  // Determine if cascade should continue
  let nextActorId: string | null = null;

  // Check for @mentions in the AI response
  const mentionedIds = extractMentionedActorIds(
    aiContent,
    aiParticipants.map((p,) => ({ actorId: p.actor_id, displayName: p.display_name, })),
  );

  // Filter out the previous actor from mentions (can't mention yourself)
  const validMentions = mentionedIds.filter((id,) => id !== previousActorId);

  if (validMentions.length > 0) {
    // Pick the first mentioned actor
    nextActorId = validMentions[0]!;
    log.info("Cascade: @mention detected", {
      nextActorId,
      mentioned: validMentions,
      depth,
    },);
  } else if (autoAdvance && aiParticipants.length > 1) {
    // Auto-advance: select next actor excluding the one that just spoke
    // Reuse the turn selector with the AI's content as context
    nextActorId = await selectNextGroupActor({
      db: database,
      chatId,
      userMessage: undefined, // No user message — let strategy decide
    },);
    // If the strategy selects the same actor, skip
    if (nextActorId === previousActorId) {
      // Try to find a different actor
      const others = aiParticipants.filter((p,) => p.actor_id !== previousActorId);
      nextActorId = others.length > 0 ? others[0]!.actor_id : null;
    }
    if (nextActorId) {
      log.info("Cascade: auto-advance selected next actor", {
        nextActorId,
        depth,
      },);
    }
  }

  if (!nextActorId) { return; }

  // Find the last message ID to use as parent for the next generation
  const lastMessage = await database
    .selectFrom("messages",)
    .select("id",)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .limit(1,)
    .executeTakeFirst();

  if (!lastMessage) { return; }

  // Trigger generation for the next actor
  log.info("Cascade: triggering next generation", {
    nextActorId,
    depth: depth + 1,
    maxTurns,
  },);

  try {
    await d.triggerAutoGeneration!({
      database,
      config,
      chatId,
      parentMessageId: lastMessage.id,
      userId,
      userMessage: undefined,
      _cascadeDepth: depth + 1,
      _cascadeActorId: nextActorId,
      deps: opts.deps,
    },);
  } catch (error) {
    log.error("Cascade generation failed", error as Error,);
  }
}

// ── Story Mode Generation ──────────────────────────────────────

/**
 * Story mode generation using GameMasterService for full GM orchestration.
 *
 * Uses the GM service for:
 * - Turn selection (TurnManager)
 * - GM decision (LLM prompt + turn prompt generation)
 * - Quality evaluation
 * - World event extraction and application
 * - Quest tracking
 * - Escalation/regeneration handling
 */
interface StoryModeOpts {
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  parentMessageId: string | null;
  userId: string;
  gmConfig: string | null;
  worldId: string | null;
  deps: GenDeps;
}

async function triggerStoryModeGeneration(opts: StoryModeOpts,): Promise<void> {
  const { database, config, chatId, parentMessageId, userId, gmConfig, worldId, deps, } = opts;
  const log = getLogger().child({ module: "auto-gen-story", },);

  // Parse GM config from chat record
  const gmConfigParsed = gmConfig ? jsonParseOr<GameMasterConfig | null>(gmConfig, null,) : null;
  if (!gmConfigParsed) {
    log.warn("Story mode chat has no valid GM config — skipping", { chatId, },);
    return;
  }

  // Resolve provider
  const resolved = await deps.resolveProvider({ userId, config, db: database, },);

  // Create generateText callback that calls the provider
  const generateText: GenerateTextFn = async (params,) => {
    const response = await resolved.provider.complete({
      model: params.model ?? resolved.resolvedModel,
      messages: params.messages,
      apiKey: resolved.resolvedApiKey,
      params: {
        temperature: params.temperature ?? 0.9,
        maxTokens: params.maxTokens ?? 2048,
      },
    },);
    return response.content;
  };

  // Create GameMasterService
  const gm = new GameMasterService({
    db: database,
    chatId,
    gmConfig: gmConfigParsed,
    generateText,
  },);

  await gm.initialize();

  // Execute turn — calls generateText internally to get GM decision
  const turnResult = await gm.executeTurn();

  // ── Hallucination guard ────────────────────────────────────────
  // Check generated content against known world entities before storing
  const hallucinationAnalysis = await detectHallucinations({
    db: database,
    text: turnResult.prompt,
    worldId: worldId ?? undefined,
  },);

  if (hallucinationAnalysis.detected) {
    log.warn("Hallucination detected in story mode generation", {
      chatId,
      turnId: turnResult.turnId,
      score: hallucinationAnalysis.score,
      flags: hallucinationAnalysis.flags.map((f,) => ({
        entity: f.entityName,
        type: f.entityType,
        confidence: f.confidence,
      })),
    },);
  }

  // Store the generated response as a message
  const messageId = uid();
  let storedContent = turnResult.prompt;
  let storedKeyId: string | null = null;
  const contentEncoding = ContentEncoding.Identity;

  if (deps.isEncryptionEnabled()) {
    const smk = deps.getSmk()!;
    const chatKey = await deps.deriveChatKeyForChat(database, chatId, smk,);
    storedContent = await deps.compressThenEncrypt({
      plaintext: turnResult.prompt,
      chatKey: chatKey.key,
      keyId: chatKey.keyId,
      config: {
        threshold: config.encryption.compressThreshold,
        algorithm: config.encryption.compressAlgorithm,
      },
    },);
    storedKeyId = chatKey.keyId;
  }

  // Compute swipe index for variant support
  let swipeIndex: number | null = null;
  if (parentMessageId) {
    const maxSwipe = await database
      .selectFrom("messages",)
      .select(database.fn.max("swipe_index",).as("max_idx",),)
      .where("chat_id", "=", chatId,)
      .where("parent_id", "=", parentMessageId,)
      .executeTakeFirst();
    swipeIndex = (maxSwipe?.max_idx ?? 0) + 1;
  }

  await database
    .insertInto("messages",)
    .values({
      id: messageId,
      chat_id: chatId,
      actor_id: turnResult.actorId,
      parent_id: parentMessageId,
      role: MessageRole.Assistant,
      content: storedContent,
      key_id: storedKeyId,
      content_type: MessageContentType.Text,
      content_format: MessageContentFormat.Markdown,
      content_encoding: contentEncoding,
      model_id: resolved.resolvedModel,
      provider: resolved.resolvedProviderName,
      status: MessageStatus.Confirmed,
      visibility: MessageVisibility.Visible,
      swipe_index: swipeIndex,
    },)
    .execute();

  // Accept response through GM pipeline (quality evaluation, world events, etc.)
  await gm.acceptResponse(turnResult.turnId, turnResult.prompt,);

  log.info("Story mode generation complete", {
    chatId,
    turnId: turnResult.turnId,
    messageId,
    actorId: turnResult.actorId,
    turnNumber: turnResult.turnNumber,
    accepted: true,
  },);
}

function escapeHtml(str: string,): string {
  return str
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",)
    .replaceAll("'", "&#039;",);
}

function sanitizeHtml(html: string,): string {
  return html
    .replaceAll(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "",)
    .replaceAll(/\bon\w+="[^"]*"/gi, "",)
    .replaceAll(/\bon\w+='[^']*'/gi, "",);
}

function renderStreamMessage(
  actorName: string,
  content: string,
  attemptId: string,
  markedParse: (s: string,) => string,
  opts?: { messageId?: string; isFinal?: boolean; thinking?: string },
): string {
  const safeName = escapeHtml(actorName,);
  const rendered = markedParse(content,);
  const safeContent = sanitizeHtml(rendered,);
  const streamingAttr = opts?.isFinal ? "" : ' data-streaming="true"';
  const msgId = opts?.messageId ?? attemptId;

  const thinkingBlock = opts?.thinking
    ? `<details class="thinking-block"><summary>Thinking process</summary><div class="thinking-content">${
      markedParse(opts.thinking,)
    }</div></details>`
    : "";

  const actionsHtml = opts?.isFinal
    ? `<div class="actions"><button class="btn-icon action-regenerate" title="Regenerate">♻</button></div>`
    : "";

  return `<div class="message assistant" data-message-id="${msgId}"${streamingAttr}><div class="bubble"><div class="meta"><span class="name">${safeName}</span><span class="time">just now</span></div>${thinkingBlock}<div class="content">${safeContent}</div>${actionsHtml}</div></div>`;
}

/** Injectable dependencies for generation functions. */
export interface GenDeps {
  cancelGenerationByChat: typeof cancelGenerationByChat;
  completeGeneration: typeof completeGeneration;
  failGeneration: typeof failGeneration;
  getOrCreateBuffer: typeof getOrCreateBuffer;
  scheduleBufferCleanup: typeof scheduleBufferCleanup;
  startGenerationTracking: typeof startGenerationTracking;
  resolveProvider: typeof resolveProvider;
  listProviders: typeof listProviders;
  callWithFailover: typeof callWithFailover;
  buildFailoverList: typeof buildFailoverList;
  isEncryptionEnabled: () => boolean;
  getSmk: () => CryptoKey | null;
  deriveChatKeyForChat: typeof deriveChatKeyForChat;
  compressThenEncrypt: typeof compressThenEncrypt;
  markedParse: (src: string, opts?: Record<string, unknown>,) => string;
  createPromptAssembler: (db: Kysely<DB>,) => PromptAssembler;
  /** Self-references for recursive calls (set automatically). */
  triggerAutoGeneration?: (opts: AutoGenOpts,) => Promise<void>;
  triggerGroupCascade?: (opts: GroupCascadeOpts,) => Promise<void>;
}

/** Return the real production implementations. */
export function createDefaultDeps(): GenDeps {
  return {
    cancelGenerationByChat,
    completeGeneration,
    failGeneration,
    getOrCreateBuffer,
    scheduleBufferCleanup,
    startGenerationTracking,
    resolveProvider,
    listProviders,
    callWithFailover,
    buildFailoverList,
    isEncryptionEnabled,
    getSmk,
    deriveChatKeyForChat,
    compressThenEncrypt,
    markedParse: (src, opts?,) => marked.parse(src, opts ?? {},) as string,
    createPromptAssembler: (db,) => new PromptAssembler(db,),
    triggerAutoGeneration,
    triggerGroupCascade,
  };
}
