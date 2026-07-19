/**
 * LLM-driven decision. Assembles a prompt via {@link PromptAssembler}, calls
 * the injected generateText, and falls back to the hardcoded decision on
 * failure.
 */
import { PromptAssembler } from "../../../assistant/prompt-assembler";
import { hardcodedDecision } from "./hardcoded";
import type { GmDecisionStrategy } from "./types";

export const llmDecision: GmDecisionStrategy = async (deps, context, actorId) => {
  const llmConfig = deps.config.llmConfig;
  const systemPrompt = llmConfig?.systemPrompt ?? "You are the Game Master for an RPG story.";

  const assembler = new PromptAssembler(deps.db);
  const assembled = await assembler.assemble({
    actorId,
    chatId: deps.chatId,
    modelId: llmConfig?.model ?? "default",
    systemPromptOverride: systemPrompt,
    includeStoryContext: true,
    includeExamples: false,
  });

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
      ? [`Previous turn: "${context.recentTurns.at(-1)?.response?.slice(0, 200) ?? "none"}"`]
      : []),
    `Keep response 50-300 words, in-character, use *action descriptions*.`,
  ].join("\n");
  assembled.messages.push({ role: "user", content: instructions });

  let responseText: string;
  try {
    responseText = await deps.generateText({
      messages: assembled.messages,
      systemPrompt: assembled.systemPrompt,
      temperature: llmConfig?.temperature,
      maxTokens: llmConfig?.maxTokens,
      provider: llmConfig?.provider,
      model: llmConfig?.model,
    });
  } catch {
    return hardcodedDecision(deps, context, actorId);
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
