// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LLM-driven decision. Assembles a prompt via {@link PromptAssembler}, calls
 * the injected generateText, and falls back to the hardcoded decision on
 * failure.
 *
 * BUG-generation-error-handling-gaps-detector-abort-void-promises:
 * The hardcoded fallback is no longer silent. Each fallback path emits a
 * structured `log.warn` and marks the resulting `GameMasterDecision` with
 * `fallback: true` so callers and telemetry can observe the degraded turn.
 */
import { PromptAssembler, } from "../../../assistant/prompt-assembler";
import { getLogger, } from "../../../logger";
import { GM_SYSTEM_PROMPT, } from "../../../prompts";

import { hardcodedDecision, } from "./hardcoded";
import type { GmDecisionStrategy, } from "./types";

export const llmDecision: GmDecisionStrategy = async (deps, context, actorId,) => {
  const llmConfig = deps.config.llmConfig;
  const actorModel = deps.config.actorModels?.[actorId];
  const resolvedModel = actorModel?.model ?? llmConfig?.model;
  const resolvedProvider = actorModel?.provider ?? llmConfig?.provider;
  const systemPrompt = llmConfig?.systemPrompt ?? deps.systemPromptDefault ?? GM_SYSTEM_PROMPT;
  const log = getLogger().child({ module: "gm-decision", },);

  const assembler = new PromptAssembler(deps.db,);
  const assembled = await assembler.assemble({
    actorId,
    chatId: deps.chatId,
    modelId: resolvedModel ?? "default",
    systemPromptOverride: systemPrompt,
    includeStoryContext: true,
    includeExamples: false,
    config: deps.appConfig,
    task: "gm-decision",
    action: `advance story at "${context.world.currentLocation.name}"`,
  },);

  const location = context.world.currentLocation;
  const instructions = [
    `Current scene: ${location.name}. ${location.atmosphere ?? ""}`,
    ...(context.activeQuests.length > 0
      ? [
        `Active quest: "${context.activeQuests[0]!.name}" (${context.activeQuests[0]!.progress}/${
          context.activeQuests[0]!.target
        })`,
      ]
      : []),
    ...(context.recentTurns.length > 0
      ? [`Previous turn: "${context.recentTurns.at(-1,)?.response?.slice(0, 200,) ?? "none"}"`,]
      : []),
    `Keep response 50-300 words, in-character, use *action descriptions*.`,
  ];
  const guidance = deps.gmGuidance;
  if (guidance?.constraints?.length) {
    instructions.push(`GM guidance — narrative constraints:\n- ${guidance.constraints.join("\n- ",)}`,);
  }
  if (guidance?.sceneDescription) {
    instructions.push(`GM scene direction: ${guidance.sceneDescription}`,);
  }
  assembled.messages.push({ role: "user", content: instructions.join("\n",), },);

  let responseText: string;
  try {
    responseText = await deps.generateText({
      messages: assembled.messages,
      systemPrompt: assembled.systemPrompt,
      temperature: llmConfig?.temperature,
      maxTokens: llmConfig?.maxTokens,
      provider: resolvedProvider,
      model: resolvedModel,
    },);
  } catch (error) {
    // BUG-generation-error-handling-gaps: surface the fallback explicitly.
    log.warn("llmDecision: LLM call failed — falling back to hardcoded decision", {
      actorId,
      chatId: deps.chatId,
      resolvedModel,
      resolvedProvider,
      error: error instanceof Error ? error.message : String(error,),
    },);
    const fallback = await hardcodedDecision(deps, context, actorId,);
    return { ...fallback, fallback: true, };
  }

  // BUG-generation-error-handling-gaps: reject empty LLM output explicitly.
  if (!responseText || !responseText.trim()) {
    log.warn("llmDecision: empty LLM response — falling back to hardcoded decision", {
      actorId,
      chatId: deps.chatId,
      resolvedModel,
      resolvedProvider,
    },);
    const fallback = await hardcodedDecision(deps, context, actorId,);
    return { ...fallback, fallback: true, };
  }

  return {
    nextActorId: actorId,
    turnPrompt: responseText,
    turnConstraints: {
      maxTokens: llmConfig?.maxTokens ?? 800,
      tone: location.atmosphere ?? undefined,
    },
    questUpdates: [],
    worldStateChanges: [],
  };
};
