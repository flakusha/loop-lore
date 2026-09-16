// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LLM prompt-template rendering (FEAT-065-LLM).
 *
 * A template override replaces the hardcoded PROMPT_SECTIONS ordering with an
 * explicit section list. Sections either link a built-in section builder by
 * `identifier` (its built messages are spliced in) or carry static content
 * with {{variable}} substitution. Static content is authored by the template
 * owner and rendered verbatim — the same trust level as an actor's own
 * system_prompt; cross-user untrusted wrapping is NOT applied here.
 *
 * Token-budget trimming reuses dropOverBudgetSections with the template's
 * per-section priorities; ordering follows the template's section order
 * (system-role messages are still front-loaded by reorderPromptMessages).
 */
import { defaultTokenCount, } from "../../generation/context-window-config";
import type { GenerationMessage, } from "../../generation/gen-types-options";
import type { LlmTemplatePayload, } from "../../generation/template-types";
import { parseTemplatePayload, type LlmTemplateSection, } from "../../generation/template-types";
import { resolveTemplateDef, } from "../../generation/template-service";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { dropOverBudgetSections, reorderPromptMessages, } from "../prompt-budget";
import { PROMPT_SECTIONS, } from "./registry";
import type { AssembleContext, AssembledPrompt, PromptSectionReport, } from "./types";

/** Ticket variable name → built-in section builder name. */
const VARIABLE_ALIASES: Record<string, string> = {
  chatHistory: "chatHistory",
  loreEntries: "lore",
  memories: "memories",
  examples: "examples",
  postHistory: "postHistory",
  sceneSummary: "storyContext",
  systemPrompt: "system",
};

/** Scalar variables available to static section content. */
interface ScalarVars {
  charName: string;
  charDescription: string;
  charPersonality: string;
  charScenario: string;
  userName: string;
  userDescription: string;
}

/**
 * Resolve a template override id and assemble from it.
 * @param db - Kysely database handle
 * @param ctx - Shared assembly context (actor/chat/params already resolved)
 * @param templateId - Template or preset id
 * @param userId - Requesting user (row ownership enforced)
 * @returns The assembled prompt, or null when the id does not resolve to an
 *   LLM template (unknown id, not owner, wrong modality, malformed payload).
 */
export async function assembleWithTemplate(
  db: Kysely<DB>,
  ctx: AssembleContext,
  templateId: string,
  userId: string,
): Promise<AssembledPrompt | null> {
  const def = await resolveTemplateDef(db, templateId, userId,);
  if (!def) { return null; }
  if (def.preset) {
    return assembleFromTemplate(ctx, { sections: def.preset.sections as LlmTemplateSection[], },);
  }
  if (def.row.modality !== "llm") { return null; }
  const payload = parseTemplatePayload(def.row.payload, "llm",);
  if (!payload || !Array.isArray((payload as LlmTemplatePayload).sections,)) { return null; }
  return assembleFromTemplate(ctx, payload as LlmTemplatePayload,);
}

/**
 * Assemble the prompt from an LLM template payload.
 * @param ctx - Shared assembly context (actor/chat/params already resolved)
 * @param payload - Parsed template payload with ordered sections
 * @returns The assembled prompt, budget-trimmed and reordered.
 */
export async function assembleFromTemplate(
  ctx: AssembleContext,
  payload: LlmTemplatePayload,
): Promise<AssembledPrompt> {
  const active = payload.sections.filter((section,) => section.enabled);
  const needed = collectNeededBuiltins(active,);

  // Run only the built-in builders the template references.
  const builtin = new Map<string, GenerationMessage[]>();
  for (const section of PROMPT_SECTIONS) {
    if (!needed.has(section.name,)) { continue; }
    if (!section.enabled(ctx,)) { continue; }
    builtin.set(section.name, await section.build(ctx,),);
  }

  const scalars = await resolveScalarVars(ctx,);
  const messages: GenerationMessage[] = [];
  const sections: PromptSectionReport[] = [];
  const priorityByName = new Map<string, number>();
  let systemPrompt: string | undefined;

  for (const [i, section,] of active.entries()) {
    const name = section.identifier || `custom:${i}`;
    let built: GenerationMessage[];
    if (section.identifier && builtin.has(section.identifier,)) {
      built = builtin.get(section.identifier,) ?? [];
    } else {
      const content = substituteVars(section.content, scalars, builtin,);
      built = [{ role: section.role, content, },];
    }
    for (const msg of built) {
      if (msg.role === "system" && systemPrompt === undefined) {
        systemPrompt = msg.content;
      }
      sections.push({
        name,
        chars: msg.content.length,
        tokens: defaultTokenCount(msg.content,),
        dropped: false,
      },);
      messages.push(msg,);
      priorityByName.set(name, section.priority,);
    }
  }

  let totalTokens = 0;
  for (const s of sections) {
    if (!s.dropped) { totalTokens += s.tokens; }
  }
  if (totalTokens > ctx.tokenBudget) {
    totalTokens = dropOverBudgetSections(
      sections,
      ctx.tokenBudget,
      totalTokens,
      (reportName,) => priorityByName.get(reportName,) ?? 0,
    );
  }

  return {
    messages: reorderPromptMessages(messages, sections,),
    systemPrompt,
    tokenCount: totalTokens,
    tokenBudget: ctx.tokenBudget,
    sections,
  };
}

/**
 * Collect the set of built-in section names a template needs: linked
 * identifiers plus any builtin referenced through {{variable}} aliases in
 * static content.
 * @param sections - Enabled template sections
 */
function collectNeededBuiltins(sections: LlmTemplatePayload["sections"],): Set<string> {
  const needed = new Set<string>();
  for (const section of sections) {
    if (section.identifier) { needed.add(section.identifier,); }
    for (const [alias, builtinName,] of Object.entries(VARIABLE_ALIASES,)) {
      if (section.content.includes(`{{${alias}}}`,)) { needed.add(builtinName,); }
    }
  }
  return needed;
}

/**
 * Substitute {{variables}} in static template content: scalars from the
 * actor/chat context, builtin section names and aliases as the joined text
 * of that section's built messages.
 * @param content - Raw template content
 * @param scalars - Scalar variable map
 * @param builtin - Built section messages keyed by builder name
 */
function substituteVars(
  content: string,
  scalars: ScalarVars,
  builtin: Map<string, GenerationMessage[]>,
): string {
  let result = content;
  for (const [key, value,] of Object.entries(scalars,)) {
    result = result.replaceAll(`{{${key}}}`, value,);
  }
  for (const [alias, builtinName,] of Object.entries(VARIABLE_ALIASES,)) {
    const joined = (builtin.get(builtinName,) ?? [])
      .map((msg,) => msg.content).join("\n\n",);
    result = result.replaceAll(`{{${alias}}}`, joined,);
    if (builtinName !== alias) {
      result = result.replaceAll(`{{${builtinName}}}`, joined,);
    }
  }
  return result;
}

/**
 * Resolve scalar variables from the assembly context. The user persona
 * (when the user impersonates or selected one) feeds {{userName}} /
 * {{userDescription}}; unknown values stay empty strings.
 * @param ctx - Shared assembly context
 */
async function resolveScalarVars(ctx: AssembleContext,): Promise<ScalarVars> {
  const vars: ScalarVars = {
    charName: ctx.actor.display_name ?? "",
    charDescription: ctx.actor.description ?? "",
    charPersonality: ctx.actor.personality ?? "",
    charScenario: ctx.actor.scenario ?? "",
    userName: "",
    userDescription: "",
  };
  const userId = ctx.params.userId;
  if (!userId) { return vars; }
  const participant = await ctx.db
    .selectFrom("chat_participants",)
    .select(["impersonate_actor_id", "persona_id",],)
    .where("chat_id", "=", ctx.params.chatId,)
    .where("actor_id", "=", userId,)
    .executeTakeFirst();
  if (!participant) { return vars; }

  if (participant.impersonate_actor_id) {
    const impersonated = await ctx.db.selectFrom("actors",)
      .select(["display_name", "description",],)
      .where("id", "=", participant.impersonate_actor_id,)
      .executeTakeFirst();
    vars.userName = impersonated?.display_name ?? "";
    vars.userDescription = impersonated?.description ?? "";
    return vars;
  }
  if (participant.persona_id) {
    const persona = await ctx.db.selectFrom("personas",)
      .select(["name", "description",],)
      .where("id", "=", participant.persona_id,)
      .executeTakeFirst();
    vars.userName = persona?.name ?? "";
    vars.userDescription = persona?.description ?? "";
  }
  return vars;
}
