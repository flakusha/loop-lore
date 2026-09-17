// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/prompt-assembler.ts
//
// Prompt assembly orchestrator. Fetches the actor/chat projections, then runs
// the ordered section builders from ./prompt/registry, applies the token
// budget, and returns the assembled prompt. See
// docs/frontend/chat/prompt-creation.md for section ordering rationale.

// size-allow: 330
import type { Kysely, } from "kysely";
import { getContextWindowForModel, } from "../admin/model-capabilities";
import { MoodService, } from "../characters/services/mood-service";
import { resolveOutputStyle, } from "../chat/output-style";
import type { OutputStylePreset, } from "../chat/output-style";
import {
  buildLengthConfig,
  isValidPreset,
  type LengthPreset,
  type ResponseLengthConfig,
} from "../chat/response-length";
import type { GmConfig, } from "../chat/types/config";
import { ChatMode, } from "../db/enums";
import type { DB, } from "../db/schema";
import { defaultTokenCount, } from "../generation/context-window-config";
import type { GenerationMessage, } from "../generation/gen-types-options";
import { getLogger, } from "../logger";
import { dropOverBudgetSections, reorderPromptMessages, } from "./prompt-budget";
import { parseJsonOr, } from "./prompt-utils";
import { PROMPT_SECTIONS, } from "./prompt/registry";
import type {
  AssembleActor,
  AssembleChat,
  AssembleContext,
  AssembledPrompt,
  PromptParams,
  PromptSectionReport,
} from "./prompt/types";

import { assembleWithTemplate, } from "./prompt/template-render";
export type { AssembledPrompt, PromptParams, PromptSectionReport, } from "./prompt/types";

/** */
export class PromptAssembler {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * @param params - assistant prompt inputs (chat, message, history, rules, …)
   * @returns the assembled `AssembledPrompt` ready for the LLM call.
   */
  async assemble(params: PromptParams,): Promise<AssembledPrompt> {
    const { actor, chat, } = await this.loadProjections(params,);
    const { ctx, resolvedResponseLength, } = await this.buildAssembleContext(params, actor, chat,);

    // FEAT-065-LLM: a prompt-template override (chat column > actor
    // settings) replaces the hardcoded section ordering when it resolves to
    // an LLM template (preset or owner-owned row); otherwise fall through
    // to the hardcoded sections.
    const templateOverrideId = chat.prompt_template_id ?? actorSettingsTemplateId(actor.settings,);
    if (templateOverrideId) {
      const fromTemplate = await assembleWithTemplate(this.db, ctx, templateOverrideId, params.userId ?? "",);
      if (fromTemplate) { return fromTemplate; }
    }


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

    if (totalTokens > ctx.tokenBudget) {
      totalTokens = dropOverBudgetSections(sections, ctx.tokenBudget, totalTokens,);
    }

    const finalMessages = reorderPromptMessages(messages, sections,);

    return {
      messages: finalMessages,
      systemPrompt,
      tokenCount: totalTokens,
      tokenBudget: ctx.tokenBudget,
      sections,
      responseLength: resolvedResponseLength,
    };
  }

  /**
   * @param params
   * @param templateId - Template or preset id to assemble from
   * @param userId - Requesting user (row ownership enforced)
   * @returns The assembled prompt, or null when the id does not resolve to
   *   an LLM template owned by `userId`.
   */
  async assembleWithTemplateOverride(
    params: PromptParams,
    templateId: string,
    userId: string,
  ): Promise<AssembledPrompt | null> {
    const { actor, chat, } = await this.loadProjections(params,);
    const { ctx, } = await this.buildAssembleContext(params, actor, chat,);
    return assembleWithTemplate(this.db, ctx, templateId, userId,);
  }

  /** */
  private async loadProjections(params: PromptParams,): Promise<{ actor: AssembleActor; chat: AssembleChat }> {
    const projectionResults = await Promise.allSettled([
      this.db
        .selectFrom("actors",)
        .select([
          "id",
          "actor_type",
          "display_name",
          "system_prompt",
          "description",
          "personality",
          "appearance",
          "default_outfit",
          "scenario",
          "post_history_instructions",
          "mes_example",
          "agent_role",
          "settings",
        ],)
        .where("id", "=", params.actorId,)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom("chats",)
        .select([
          "id",
          "mode",
          "world_id",
          "current_location_id",
          "prompt_override",
          "output_style_preset",
          "gm_config",
          "response_length_preset",
          "response_length_custom",
          "custom_instructions",
          "prompt_template_id",
        ],)
        .where("id", "=", params.chatId,)
        .executeTakeFirstOrThrow(),
    ],);
    const actorResult = projectionResults[0];
    const chatResult = projectionResults[1];
    if (actorResult.status === "rejected") { throw actorResult.reason; }
    if (chatResult.status === "rejected") { throw chatResult.reason; }
    return {
      actor: { ...actorResult.value, type: actorResult.value.actor_type, },
      chat: chatResult.value,
    };
  }

  /** */
  private async buildAssembleContext(
    params: PromptParams,
    actor: AssembleActor,
    chat: AssembleChat,
  ): Promise<{ ctx: AssembleContext; resolvedResponseLength: ResponseLengthConfig }> {
    // ── Resolve output style + response length (chat → user → server) ──
    // ── Resolve output style + response length (chat → user → server) ──
    const gmConfig = parseJsonOr<GmConfig | null>(chat.gm_config, null,);
    let userOutputStylePreset: OutputStylePreset | null = null;
    let userResponseLengthPreset: LengthPreset | null = null;
    let userCustomInstructions: string | null = null;
    if (params.userId) {
      const userRow = await this.db
        .selectFrom("users",)
        .select("settings",)
        .where("id", "=", params.userId,)
        .executeTakeFirst();
      const userSettings = parseJsonOr<
        {
          outputStyle?: { preset?: OutputStylePreset };
          responseLength?: { preset?: LengthPreset };
          customInstructions?: string | null;
        } | null
      >(userRow?.settings ?? null, null,);
      userOutputStylePreset = userSettings?.outputStyle?.preset ?? null;
      userResponseLengthPreset =
        typeof userSettings?.responseLength?.preset === "string" && isValidPreset(userSettings.responseLength.preset,)
          ? userSettings.responseLength.preset
          : null;
      userCustomInstructions = typeof userSettings?.customInstructions === "string"
        ? userSettings.customInstructions
        : null;
    }
    const resolvedOutputStyle = resolveOutputStyle(
      chat.output_style_preset as OutputStylePreset | null,
      gmConfig?.outputStyle ?? null,
      userOutputStylePreset,
      params.config?.generation?.chatDefaults?.outputStyle ?? null,
    );
    const rawChatPreset: unknown = chat.response_length_preset;
    const chatPreset = typeof rawChatPreset === "string" && isValidPreset(rawChatPreset,) ? rawChatPreset : null;
    const resolvedResponseLength = buildLengthConfig(
      chatPreset ?? userResponseLengthPreset ?? "medium",
      undefined,
      chat.response_length_custom ?? undefined,
    );

    // Per-world setup overlay: apply scenario/system-prompt overrides for the
    // chat's world (character_world_setup). Non-null overrides win over the
    // base actor setup; the base value is untouched.
    let effectiveActor = actor;
    let worldSystemPromptOverride: string | null = null;
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
        worldSystemPromptOverride = setup.system_prompt_override;
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
      // Pass through the raw override values so `system.ts` can wrap them
      // with a clear "untrusted user content" marker (TASK-character-world-
      // prompt-overrides-injected-verbatim-as-system).
      chat: {
        ...chat,
        prompt_override: chat.prompt_override ?? null,
        world_system_prompt_override: worldSystemPromptOverride,
      },
      params: efParams,
      tokenBudget,
      config: efParams.config,
      task: efParams.task,
      action: efParams.action,
      assistantName: efParams.assistantName,
      gmName: efParams.gmName,
      outputStyle: resolvedOutputStyle,
      responseLength: resolvedResponseLength,
      userCustomInstructions,
      isStory,
    };
    return { ctx, resolvedResponseLength, };
  }
  /**
   * Resolve the character's current emotional state for prompt injection.
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

export { parseJsonOr, } from "./prompt-utils";

/**
 * Read the actor-level LLM template override from the actor's settings JSON.
 * @param settingsJson - Raw `actors.settings` text
 * @returns The referenced template id, or null when unset/malformed.
 */
function actorSettingsTemplateId(settingsJson: string | null | undefined,): string | null {
  if (!settingsJson) { return null; }
  const parsed = parseJsonOr<unknown>(settingsJson, null,);
  if (parsed === null || typeof parsed !== "object") { return null; }
  const templateId = (parsed as { prompt_template_id?: unknown }).prompt_template_id;
  return typeof templateId === "string" ? templateId : null;
}
