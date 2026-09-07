// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { detectHallucinations, } from "../../chat";
import type { GmGuidance, } from "../../chat/types/config";
import {
  ContentEncoding,
  GameMasterType,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../db/enums";
import { getLogger, } from "../../logger";
import { resolveSystemPrompt, } from "../../prompts";
import { type GameMasterConfig, GameMasterService, } from "../../story";
import type { GenerateTextFn, } from "../../story/game-master";
import { jsonParseOr, uid, } from "../../utils";
import { runContentHooks, } from "./content-hooks";
import type { StoryModeOpts, } from "./story-mode-opts";
export type { StoryModeOpts, } from "./story-mode-opts";

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
 *
 * Stores the AI's `response` text (the assistant message the user should see),
 * NOT the LLM-bound `prompt` text — see BUG-story-mode-prompt-stored-as-content.
 * @param opts
 */
export async function triggerStoryModeGeneration(opts: StoryModeOpts,): Promise<void> {
  const { database, config, chatId, parentMessageId, userId, gmConfig, worldId, deps, } = opts;
  const log = getLogger().child({ module: "auto-gen-story", },);

  // Parse GM config from chat record. The chat's `gm_config` column stores the
  // chat-level `GmConfig` (assistantRole / visualNovel / storyMode / gmGuidance)
  // — a different shape from the story-domain `GameMasterConfig`. Extract the
  // human-GM guidance and derive a `GameMasterConfig` for the service.
  const gmConfigRaw = gmConfig ? jsonParseOr<Record<string, unknown> | null>(gmConfig, null,) : null;
  if (!gmConfigRaw) {
    // Story-mode chat with no GM config: don't silently skip generation (the
    // caller is fire-and-forget — a return here leaves the user's message with
    // no reply and no surfaced error). Synthesize a minimal config so
    // GameMasterService falls back to LLM mode with defaults. Operators still
    // see the missing-config signal via the warn below.
    log.warn("Story mode chat has no valid GM config — synthesizing default LLM config", { chatId, },);
  }
  const gmGuidance = gmConfigRaw?.gmGuidance as GmGuidance | undefined;
  const gameMasterConfig: GameMasterConfig = {
    type: (gmConfigRaw?.type as GameMasterType | undefined) ?? GameMasterType.Llm,
    ...(gmConfigRaw?.llmConfig
      ? { llmConfig: gmConfigRaw.llmConfig as GameMasterConfig["llmConfig"], }
      : {}),
    ...(gmConfigRaw?.actorModels
      ? { actorModels: gmConfigRaw.actorModels as GameMasterConfig["actorModels"], }
      : {}),
    ...(gmConfigRaw?.humanGM ? { humanGM: gmConfigRaw.humanGM as GameMasterConfig["humanGM"], } : {}),
    ...(typeof gmConfigRaw?.escalationThreshold === "number"
      ? { escalationThreshold: gmConfigRaw.escalationThreshold, }
      : {}),
  };

  // Resolve the chat's default provider once, to seed the metadata stored on
  // the generated message when no per-actor override is applied (e.g. Human
  // mode, or an actor with no actorModels entry).
  const defaultResolved = await deps.resolveProvider({ userId, config, db: database, },);
  let usedProviderName = defaultResolved.resolvedProviderName;
  let usedModel = defaultResolved.resolvedModel;

  // Create generateText callback that calls the provider. The GM service may
  // request a per-actor provider/model (params.provider / params.model sourced
  // from GameMasterConfig.actorModels); resolve that provider per-call so each
  // actor generates through its own LLM provider rather than the chat default.
  const generateText: GenerateTextFn = async (params,) => {
    const callResolved = await deps.resolveProvider({
      userId,
      config,
      db: database,
      provider: params.provider || undefined,
      model: params.model || undefined,
    },);
    usedProviderName = callResolved.resolvedProviderName;
    usedModel = callResolved.resolvedModel;

    const response = await callResolved.provider.complete({
      model: callResolved.resolvedModel,
      messages: params.messages,
      apiKey: callResolved.resolvedApiKey,
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

  // In Human GM mode `turnResult.response` is null — there is no AI reply
  // to store. The GM IS the user and posts via the chat input directly,
  // so we must NOT auto-store a message (otherwise the user sees their
  // own GM prompt echoed back as the AI's reply — see
  // BUG-story-mode-prompt-stored-as-content). An empty-string response
  // is also skipped: there is no assistant message worth persisting.
  if (!turnResult.response) {
    log.info(
      "story-mode: Human GM turn produced no response — skipping auto-store",
      { chatId, turnId: turnResult.turnId, actorId: turnResult.actorId, },
    );
    return;
  }

  // Check generated content against known world entities before storing.
  // Hallucination detection runs on the AI response (`turnResult.response`),
  // not the prompt we sent to the LLM.
  const hallucinationAnalysis = await detectHallucinations({
    db: database,
    text: turnResult.response,
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

  let storedContent = turnResult.response;

  let storedKeyId: string | null = null;
  const contentEncoding = ContentEncoding.Identity;
  // ensureActorKey is required before deriveChatKeyForChat in the standard path —
  // without it the actor_keys row is missing and per-chat derivation crashes.
  const smk = deps.getSmk() ?? undefined;
  if (smk) { await deps.ensureActorKey({ database, actorId: turnResult.actorId, smk, },); }
  const encryptionLevel = await deps.getChatEncryptionLevel(database, chatId,);
  const result = await deps.encryptAtRest({
    database,
    chatId,
    plaintext: turnResult.response,
    encryptionLevel,
    config: {
      threshold: config.encryption.compressThreshold,
      algorithm: config.encryption.compressAlgorithm,
    },
  },);
  storedContent = result.storedContent;
  storedKeyId = result.keyId;

  // Run the full content-hook chain (NSFW gate + emotion + mood + moderation)
  // BEFORE persisting the generated story/GM content. Previously this path
  // only invoked the emotion hook via a bare runHookChain call with
  // eventTypes=["emotion_change"], which silently bypassed the NSFW gate
  // (eventTypes "nsfw_gate" / "privacy_check") and the moderation hook
  // (BUG-f0683a8 — story/GM generation never NSFW-gated, content safety
  // bypass). Reusing runContentHooks guarantees the same pre-store policy
  // enforcement as the regular auto-gen path (auto-generation.ts:163).
  //
  // Failure policy: if the hook chain throws, fail CLOSED and abort the
  // turn (no message persisted). This is a deliberate change from the
  // prior emotion-hook try/catch which swallowed errors — fail-closed is
  // safer for a NSFW-gated pipeline (per-content safety bypass is worse
  // than a missed emotion for one turn). The outer `triggerStoryModeGeneration`
  // is called from a try/catch in the auto-gen orchestrator that records
  // the error.
  let dominantEmotion: string | null = null;
  try {
    const hooks = await runContentHooks({
      database,
      config,
      chatId,
      actorId: turnResult.actorId,
      userId,
      content: turnResult.response,
    },);
    if (!hooks.allowed) {
      log.warn("story-mode: generation blocked by content hooks", {
        chatId,
        actorId: turnResult.actorId,
      },);
      return;
    }
    dominantEmotion = hooks.dominantEmotion ?? null;
  } catch (error) {
    log.error(
      "story-mode: content-hook chain threw — aborting turn (fail-closed)",
      error instanceof Error ? error : new Error(String(error,),),
      { chatId, actorId: turnResult.actorId, },
    );
    throw error;
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
      model_id: usedModel,
      provider: usedProviderName,
      status: MessageStatus.Confirmed,
      visibility: MessageVisibility.Visible,
      swipe_index: swipeIndex,
      emotion: dominantEmotion,
    },)
    .execute();

  // Accept the AI's RESPONSE (not the prompt) through the GM pipeline.
  // acceptResponse(turnId, response) records quality evaluation, world
  // events, etc. against the actual assistant message.
  await gm.acceptResponse(turnResult.turnId, turnResult.response,);

  log.info("Story mode generation complete", {
    chatId,
    turnId: turnResult.turnId,
    messageId,
    actorId: turnResult.actorId,
    turnNumber: turnResult.turnNumber,
    accepted: true,
  },);
}
