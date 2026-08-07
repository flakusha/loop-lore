import type { Kysely, } from "kysely";
import { detectAvatarChangeIntent, } from "../../assistant/intent";
import { MoodService, } from "../../characters/services/mood-service";
import { detectHallucinations, } from "../../chat";
import type { Config, } from "../../config/schema";
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
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { selectNextGroupActor, } from "../../group-chat/turn-selector";
import { getRegisteredHooks, runHookChain, } from "../hooks";
import type { HookEventType, } from "../hooks";
import { processStreamingChunk, } from "../index";
import { getLogger, } from "../../logger";
import { resolveSystemPrompt, } from "../../prompts";
import type { ChunkEvent, } from "../providers/types";
import { isTelemetryEnabled, record, } from "../../telemetry/service";
import { applyRegexTransforms, } from "../transforms";
import { jsonParseOr, uid, } from "../../utils";
import { classifyIntent, } from "./classify-intent";
import { createDefaultDeps, type GenDeps, } from "./deps";
import { renderStreamMessage, } from "./stream-render";
import { triggerStoryModeGeneration, } from "./story-mode";

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

    // ── GM role runtime effect ─────────────────────────────────────
    // The chat's `assistantRole` (from `chats.gm_config`, set via the role
    // dropdown in chat settings) is stored but until now had no backend
    // effect outside story mode. For `"gm"` role we branch the assembled
    // prompt's system message onto the config-driven GM prompt so the
    // character responds in a GM/narrator voice. Other roles fall through
    // to the normal assistant/character prompt.
    const assistantRole = chat?.gm_config
      ? jsonParseOr<{ assistantRole?: "off" | "helper" | "gm" | "moderator" }>(chat.gm_config, {},).assistantRole
      : undefined;
    const systemPromptOverride = assistantRole === "gm"
      ? resolveSystemPrompt(config.templates.llm, "gm",)
      : undefined;

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

    // Wire the config-driven avatar-change intent detector: when the user's
    // latest message matches a pattern in config.templates.avatar.intentPatterns,
    // the resolved emotion is injected as params.emotion so the emotionAvatar
    // section fires (and the generation provider picks the matching emotion
    // modifier). No match → undefined → the assembler falls back to the actor's
    // persisted mood.
    const detectedEmotion = userMessage && config.templates.avatar
      ? detectAvatarChangeIntent(userMessage, config.templates.avatar,) ?? undefined
      : undefined;

    const prompt = await assembler.assemble({
      actorId: characterId,
      chatId,
      modelId: resolved.resolvedModel,
      groupParticipantIds,
      config,
      systemPromptOverride,
      emotion: detectedEmotion,
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
      ? jsonParseOr<Record<string, unknown>>(availability.nsfw_policy, {},).level as string | undefined
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
        nsfwConfig: config.nsfw ??
          { allowNsfw: false, nsfwMinAge: 0, defaultNsfwScope: "chat", consentRequired: true, auditLogging: true, },
        db: database,
      },
    },);

    if (!hookResult.allowed) {
      log.warn("Generation blocked by content hooks", {
        reason: hookResult.events.map((e,) => e.reason).join("; ",),
      },);
      return;
    }

    // Extract the dominant emotion detected by the EmotionHook (emotion_change
    // event) so it can be bound to this message for per-message avatar rendering.
    const dominantEmotion = hookResult.events.find(
      (e,) => e.eventType === "emotion_change" && typeof e.data?.dominantEmotion === "string",
    )?.data?.dominantEmotion as string | undefined;

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
      // ensureActorKey is required before deriveChatKeyForChat — without it the
      // actor_key row is missing and derivation crashes in story/GM chats
      // (the actor may never have been provisioned on this chat's path).
      await d.ensureActorKey({ database, actorId: characterId, smk, },);
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
        emotion: dominantEmotion ?? null,
      },)
      .execute();
    log.debug("message stored", { messageId, contentLength: accumulatedContent.length, requestId, },);

    // ── Mood shift persistence ──────────────────────────────────
    // If the MoodHook detected a mood shift, apply its delta to the character's
    // world-scoped mood record so mood auto-tracks the conversation's tone.
    // Best-effort: a missing mood row (no-op) or a DB failure is logged, never
    // allowed to fail generation.
    const moodShift = hookResult.events.find(
      (e,) => e.eventType === "mood_shift" && typeof e.data?.delta === "number",
    );
    if (moodShift && typeof moodShift.data?.delta === "number") {
      try {
        await MoodService(database,).applyHappinessDelta(
          characterId,
          chat?.world_id ?? undefined,
          moodShift.data.delta,
        );
      } catch (error) {
        log.warn("mood-hook: failed to persist mood shift", { err: error, },);
      }
    }

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
          model: resolved.resolvedModel,
          provider: resolved.resolvedProviderName,
          finishReason,
        },
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
      void (async () => {
        try {
          await d.triggerGroupCascade!({
            database,
            config,
            chatId,
            userId,
            aiContent: accumulatedContent,
            previousActorId: characterId,
            depth: cascadeDepth,
            deps: opts.deps,
          },);
        } catch {
          /* errors logged inside triggerGroupCascade */
        }
      })();
    }
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
