// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { detectHallucinations, } from "../../chat";
import type { GmGuidance, } from "../../chat/types/config";
import { GameMasterType, } from "../../db/enums";
import { getLogger, } from "../../logger";
import { resolveSystemPrompt, } from "../../prompts";
import { type GameMasterConfig, GameMasterService, } from "../../story";
import type { GenerateTextFn, } from "../../story/game-master";
import { jsonParseOr, } from "../../utils";
import { storeStoryResponse, } from "./story-store";
import type { StoryModeOpts, } from "./story-mode-opts";
export type { StoryModeOpts, };

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

  // Persist the response (encrypt + content-hook gate + swipe + insert).
  // A null return means the content hooks blocked the turn — acceptResponse
  // and the completion log are skipped exactly as before.
  const stored = await storeStoryResponse({
    database,
    config,
    chatId,
    userId,
    parentMessageId,
    actorId: turnResult.actorId,
    response: turnResult.response,
    usedModel,
    usedProviderName,
    deps,
    log,
  },);
  if (!stored) { return; }
  const messageId = stored.messageId;

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
