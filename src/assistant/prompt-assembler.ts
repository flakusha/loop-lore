// src/assistant/prompt-assembler.ts
//
// Prompt assembly orchestrator. Fetches the actor/chat projections, then runs
// the ordered section builders from ./prompt/registry, applies the token
// budget, and returns the assembled prompt. See
// docs/frontend/chat/prompt-creation.md for section ordering rationale.

import type { Kysely, } from "kysely";
import { MoodService, } from "../characters/services/mood-service";
import { ChatMode, } from "../db/enums";
import type { DB, } from "../db/schema";
import { ContextCompactor, } from "../generation/context-compactor";
import { defaultTokenCount, } from "../generation/context-window-config";
import type { GenerationMessage, } from "../generation/gen-types-options";
import { getLogger, } from "../logger";
import { PROMPT_SECTIONS, } from "./prompt/registry";
import { PRIORITY, } from "./prompt/types";
import type {
  AssembleChat,
  AssembleContext,
  AssembledPrompt,
  PromptParams,
  PromptSectionReport,
} from "./prompt/types";

export type { AssembledPrompt, PromptParams, PromptSectionReport, } from "./prompt/types";

export class PromptAssembler {
  constructor(private readonly db: Kysely<DB>,) {}

  async assemble(params: PromptParams,): Promise<AssembledPrompt> {
    const [actor, chat,] = await Promise.all([
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
        .select(["id", "mode", "world_id", "current_location_id",],)
        .where("id", "=", params.chatId,)
        .executeTakeFirstOrThrow(),
    ],);

    const isStory = params.includeStoryContext ?? chat.mode === ChatMode.Story;
    const tokenBudget = params.tokenBudget ?? 32_000;

    // Wire the emotion prompt-injection loop: the emotionAvatar section fires
    // only when params.emotion (or emotionAvatar) is set. Every generation
    // callsite omits it, so default it to the character's persisted mood
    // (character_mood.current_mood, kept current by the mood/emotion hooks).
    // An explicit caller override always wins.
    const currentEmotion = params.emotion ?? await this.resolveCurrentEmotion(params, chat,);
    const efParams = currentEmotion ? { ...params, emotion: currentEmotion, } : params;

    const ctx: AssembleContext = {
      db: this.db,
      actor,
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
        if (section.name === "system" && systemPrompt === undefined) { systemPrompt = msg.content; }
      }
    }

    let totalTokens = sections.reduce((sum, s,) => sum + (s.dropped ? 0 : s.tokens), 0,);

    if (totalTokens > tokenBudget) {
      // Drop sections in descending priority order (lowest priority first).
      const ordered = sections
        .map((s, i,) => ({ ...s, index: i, }))
        .filter((s,) => !s.dropped && PRIORITY[s.name as keyof typeof PRIORITY] > 0)
        .sort(
          (a, b,) =>
            (PRIORITY[b.name as keyof typeof PRIORITY] ?? 99) -
            (PRIORITY[a.name as keyof typeof PRIORITY] ?? 99),
        );

      for (const section of ordered) {
        if (totalTokens <= tokenBudget) { break; }
        section.dropped = true;
        sections[section.index]!.dropped = true;
        totalTokens -= section.tokens;
      }
    }

    // `sections` and `messages` are 1:1 lockstep (one section pushed per
    // message), so dropping a section means dropping the message at the same
    // index. Dropped sections are low-priority (lore/memories/examples) and
    // sit at the front, so a tail splice would wrongly strip chat history.
    //
    // Jinja chat templates (vLLM, llama.cpp) require all system messages
    // before any user/assistant message. Single pass: system msgs splice to
    // front, everything else pushes to end.
    const finalMessages: GenerationMessage[] = [];
    let sysEnd = 0;
    for (const [i, msg,] of messages.entries()) {
      if (sections[i]?.dropped) { continue; }
      if (msg.role === "system") {
        finalMessages.splice(sysEnd++, 0, msg,);
      } else {
        finalMessages.push(msg,);
      }
    }

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
      const mood = await new MoodService(this.db,).getMood(params.actorId, chat.world_id ?? undefined,);
      return mood?.currentMood || undefined;
    } catch (error) {
      // Mood lookup is best-effort — never fail or slow down generation when
      // the store is unavailable (e.g. mock DBs in tests/embedding contexts).
      getLogger().debug("prompt-assembler: mood lookup failed, skipping emotion injection", { err: error, },);
      return undefined;
    }
  }
}

/**
 * Compact conversation history when prompt exceeds token budget.
 *
 * After the assembler drops low-priority sections, if the remaining messages
 * still exceed the budget, the ContextCompactor summarizes the older half
 * of chat history into a single system message.
 *
 * @param messages - Assembled message list (mutated in place)
 * @param tokenBudget - Maximum token budget
 * @returns Summary text if compaction occurred, undefined otherwise
 */
export async function compactPromptHistory(
  messages: GenerationMessage[],
  tokenBudget: number,
): Promise<string | undefined> {
  const compactor = new ContextCompactor({ threshold: 0.85, keepLast: 10, },);
  const total = compactor.totalTokens(messages,);
  if (total <= tokenBudget * 0.85) { return undefined; }

  const {
    messages: compacted,
    compacted: didCompact,
    summary,
  } = await compactor.compact(messages, tokenBudget,);
  if (!didCompact) { return undefined; }

  // Replace the message list contents with the compacted version
  messages.length = 0;
  messages.push(...compacted,);
  return summary;
}
