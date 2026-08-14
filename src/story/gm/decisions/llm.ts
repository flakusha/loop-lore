/**
 * LLM-driven decision. Assembles a prompt via {@link PromptAssembler}, calls
 * the injected generateText, and falls back to the hardcoded decision on
 * failure.
 */
import { PromptAssembler, } from "../../../assistant/prompt-assembler";
import { GM_SYSTEM_PROMPT, } from "../../../prompts";
import { hardcodedDecision, } from "./hardcoded";
import type { GmDecisionStrategy, } from "./types";

export const llmDecision: GmDecisionStrategy = async (deps, context, actorId,) => {
  const llmConfig = deps.config.llmConfig;
  // Per-actor model override (multi-LLM story mode). Falls back to the GM
  // llmConfig when the actor has no explicit assignment.
  const actorModel = deps.config.actorModels?.[actorId];
  const resolvedModel = actorModel?.model ?? llmConfig?.model;
  const resolvedProvider = actorModel?.provider ?? llmConfig?.provider;
  const systemPrompt = llmConfig?.systemPrompt ?? deps.systemPromptDefault ?? GM_SYSTEM_PROMPT;

  const assembler = new PromptAssembler(deps.db,);
  const assembled = await assembler.assemble({
    actorId,
    chatId: deps.chatId,
    modelId: resolvedModel ?? "default",
    systemPromptOverride: systemPrompt,
    includeStoryContext: true,
    includeExamples: false,
    config: deps.appConfig,
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
  } catch {
    return hardcodedDecision(deps, context, actorId,);
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
