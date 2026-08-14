import type { Kysely, } from "kysely";
import { detectHallucinations, } from "../../chat";
import type { GmGuidance, } from "../../chat/types/config";
import type { Config, } from "../../config/schema";
import {
  ContentEncoding,
  GameMasterType,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { getRuntimeNsfwConfig, } from "../../nsfw/runtime-config";
import { resolveSystemPrompt, } from "../../prompts";
import { type GameMasterConfig, GameMasterService, } from "../../story";
import type { GenerateTextFn, } from "../../story/game-master";
import { jsonParseOr, uid, } from "../../utils";
import { getRegisteredHooks, runHookChain, } from "../hooks";
import type { GenDeps, } from "./deps";

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

export async function triggerStoryModeGeneration(opts: StoryModeOpts,): Promise<void> {
  const { database, config, chatId, parentMessageId, userId, gmConfig, worldId, deps, } = opts;
  const log = getLogger().child({ module: "auto-gen-story", },);

  // Parse GM config from chat record. The chat's `gm_config` column stores the
  // chat-level `GmConfig` (assistantRole / visualNovel / storyMode / gmGuidance)
  // — a different shape from the story-domain `GameMasterConfig`. Extract the
  // human-GM guidance and derive a `GameMasterConfig` for the service.
  const gmConfigRaw = gmConfig ? jsonParseOr<Record<string, unknown> | null>(gmConfig, null,) : null;
  if (!gmConfigRaw) {
    log.warn("Story mode chat has no valid GM config — skipping", { chatId, },);
    return;
  }
  const gmGuidance = gmConfigRaw.gmGuidance as GmGuidance | undefined;
  const gameMasterConfig: GameMasterConfig = {
    type: (gmConfigRaw.type as GameMasterType | undefined) ?? GameMasterType.Llm,
    ...(gmConfigRaw.llmConfig
      ? { llmConfig: gmConfigRaw.llmConfig as GameMasterConfig["llmConfig"], }
      : {}),
    ...(gmConfigRaw.humanGM ? { humanGM: gmConfigRaw.humanGM as GameMasterConfig["humanGM"], } : {}),
    ...(typeof gmConfigRaw.escalationThreshold === "number"
      ? { escalationThreshold: gmConfigRaw.escalationThreshold, }
      : {}),
  };

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
    gmConfig: gameMasterConfig,
    gmGuidance,
    generateText,
    systemPromptDefault: resolveSystemPrompt(config.templates.llm, "gm",),
    appConfig: config,
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
      flags: Array.from(hallucinationAnalysis.flags, (f,) => ({
        entity: f.entityName,
        type: f.entityType,
        confidence: f.confidence,
      }),),
    },);
  }

  // Store the generated response as a message
  const messageId = uid();
  let storedContent = turnResult.prompt;
  let storedKeyId: string | null = null;
  const contentEncoding = ContentEncoding.Identity;

  if (deps.isEncryptionEnabled()) {
    const smk = deps.getSmk()!;
    // ensureActorKey is required before deriveChatKeyForChat — without it the
    // actor_key row is missing and derivation crashes in story/GM chats
    // (the actor may never have been provisioned on this chat's path).
    await deps.ensureActorKey({ database, actorId: turnResult.actorId, smk, },);
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

  // Detect the dominant emotion on the generated story content via the same
  // EmotionHook used by the regular path (gated on config.hooks.enableEmotionHooks),
  // so GM/story messages also get a per-message emotion for avatar rendering.
  let dominantEmotion: string | null = null;
  const storyHooksConfig = config.hooks ?? {
    enableMoodHooks: true,
    enableEmotionHooks: true,
    enableNsfwHooks: true,
    enableModerationHooks: true,
  };
  if (storyHooksConfig.enableEmotionHooks) {
    try {
      const emotionResult = await runHookChain({
        hooks: [...getRegisteredHooks(),],
        context: {
          chatId,
          actorId: turnResult.actorId,
          userId,
          content: turnResult.prompt,
          nsfwPolicy: undefined,
          privacyLevel: "standard",
          eventTypes: ["emotion_change",],
          config,
          nsfwConfig: getRuntimeNsfwConfig(),
          db: database,
        },
      },);
      const emotionEvent = emotionResult.events.find(
        (e,) => e.eventType === "emotion_change" && typeof e.data?.dominantEmotion === "string",
      );
      dominantEmotion = (emotionEvent?.data?.dominantEmotion as string | undefined) ?? null;
    } catch (error) {
      log.warn("emotion-hook: story emotion detection failed", { err: error, },);
    }
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
      emotion: dominantEmotion,
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
