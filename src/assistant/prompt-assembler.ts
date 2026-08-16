// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/prompt-assembler.ts
//
// Prompt assembly orchestrator. Fetches the actor/chat projections, then runs
// the ordered section builders from ./prompt/registry, applies the token
// budget, and returns the assembled prompt. See
// docs/frontend/chat/prompt-creation.md for section ordering rationale.

import type { Kysely, } from "kysely";
import { getContextWindowForModel, } from "../admin/model-capabilities";
import { MoodService, } from "../characters/services/mood-service";
import { ChatMode, } from "../db/enums";
import type { DB, } from "../db/schema";
import { defaultTokenCount, } from "../generation/context-window-config";
import type { GenerationMessage, } from "../generation/gen-types-options";
import { getLogger, } from "../logger";
import { dropOverBudgetSections, reorderPromptMessages, } from "./prompt-budget";
import { PROMPT_SECTIONS, } from "./prompt/registry";
import type {
  AssembleChat,
  AssembleContext,
  AssembledPrompt,
  PromptParams,
  PromptSectionReport,
} from "./prompt/types";

export { compactPromptHistory, } from "./prompt-budget";
export type { AssembledPrompt, PromptParams, PromptSectionReport, } from "./prompt/types";

export class PromptAssembler {
  constructor(private readonly db: Kysely<DB>,) {}

  async assemble(params: PromptParams,): Promise<AssembledPrompt> {
    const projectionResults = await Promise.allSettled([
      this.db
        .selectFrom("actors",)
        .select([
          "id",
          "display_name",
          "system_prompt",
          "description",
          "personality",
          "scenario",
          "post_history_instructions",
          "mes_example",
          "agent_role",
        ],)
        .where("id", "=", params.actorId,)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom("chats",)
        .select(["id", "mode", "world_id", "current_location_id", "prompt_override",],)
        .where("id", "=", params.chatId,)
        .executeTakeFirstOrThrow(),
    ],);
    const actorResult = projectionResults[0];
    const chatResult = projectionResults[1];
    if (actorResult.status === "rejected") { throw actorResult.reason; }
    if (chatResult.status === "rejected") { throw chatResult.reason; }
    const actor = actorResult.value;
    const chat = chatResult.value;

    // Per-world setup overlay: apply scenario/system-prompt overrides for the
    // chat's world (character_world_setup). Non-null overrides win over the
    // base actor setup; the base value is untouched.
    let effectiveActor = actor;
    if (chat.world_id) {
      const setup = await this.db
        .selectFrom("character_world_setup",)
        .select(["scenario_override", "system_prompt_override",],)
        .where("actor_id", "=", params.actorId,)
        .where("world_id", "=", chat.world_id,)
        .executeTakeFirst();
      if (setup && (setup.scenario_override !== null || setup.system_prompt_override !== null)) {
        effectiveActor = {
          ...actor,
          scenario: setup.scenario_override ?? actor.scenario,
          system_prompt: setup.system_prompt_override ?? actor.system_prompt,
        };
      }
    }

    // Per-chat prompt override — highest precedence, above world-setup and
    // character prompts (TASK-PROMPT-TEMPLATE-PER-CHAT-OVERRIDE-UX).
    if (chat.prompt_override) {
      effectiveActor = {
        ...effectiveActor,
        system_prompt: chat.prompt_override,
      };
    }

    const isStory = params.includeStoryContext ?? chat.mode === ChatMode.Story;

    // Resolve token budget: explicit param > model capability registry > default 32K
    let tokenBudget = params.tokenBudget;
    if (tokenBudget === undefined && params.providerId) {
      const registryBudget = await getContextWindowForModel(this.db, params.providerId, params.modelId,);
      if (registryBudget !== null) { tokenBudget = registryBudget; }
    }
    tokenBudget ??= 32_000;

    // Wire the emotion prompt-injection loop: the emotionAvatar section fires
    // only when params.emotion (or emotionAvatar) is set. Every generation
    // callsite omits it, so default it to the character's persisted mood
    // (character_mood.current_mood, kept current by the mood/emotion hooks).
    // An explicit caller override always wins.
    const currentEmotion = params.emotion ?? await this.resolveCurrentEmotion(params, chat,);
    const efParams = currentEmotion ? { ...params, emotion: currentEmotion, } : params;

    const ctx: AssembleContext = {
      db: this.db,
      actor: effectiveActor,
      chat,
      params: efParams,
      isStory,
      tokenBudget,
      config: efParams.config,
    };

    const sections: PromptSectionReport[] = [];
    const messages: GenerationMessage[] = [];
    let systemPrompt: string | undefined;

    for (const section of PROMPT_SECTIONS) {
      if (!section.enabled(ctx,)) { continue; }
      const built = await section.build(ctx,);
      for (const msg of built) {
        const tokens = defaultTokenCount(msg.content,);
        sections.push({ name: section.name, chars: msg.content.length, tokens, dropped: false, },);
        messages.push(msg,);
        if (systemPrompt === undefined && section.name === "system") { systemPrompt = msg.content; }
      }
    }

    let totalTokens = 0;
    for (const s of sections) { if (!s.dropped) { totalTokens += s.tokens; } }

    if (totalTokens > tokenBudget) {
      totalTokens = dropOverBudgetSections(sections, tokenBudget, totalTokens,);
    }

    const finalMessages = reorderPromptMessages(messages, sections,);

    return {
      messages: finalMessages,
      systemPrompt,
      tokenCount: totalTokens,
      tokenBudget,
      sections,
    };
  }

  /**
   * Resolve the character's current emotional state for prompt injection.
   *
   * @param params - Prompt params (emotion field read for the actor/world)
   * @param chat - Assembled chat projection (provides the world scope)
   * @returns The persisted current mood string, or undefined when mood is
   *   absent/empty (in which case the emotionAvatar section stays off).
   */
  private async resolveCurrentEmotion(params: PromptParams, chat: AssembleChat,): Promise<string | undefined> {
    try {
      const mood = await MoodService(this.db,).getMood(params.actorId, chat.world_id ?? undefined,);
      return mood?.currentMood || undefined;
    } catch (error) {
      // Mood lookup is best-effort — never fail or slow down generation when
      // the store is unavailable (e.g. mock DBs in tests/embedding contexts).
      getLogger().debug("prompt-assembler: mood lookup failed, skipping emotion injection", { err: error, },);
      return undefined;
    }
  }
}
