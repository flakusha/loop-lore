// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt budget helpers — token-budget enforcement and message reordering
 * for the prompt assembler.
 *
 * Extracted from prompt-assembler.ts so the assembler class stays focused
 * on orchestration and the size gate stays green.
 */

import { ContextCompactor, } from "../generation/context-compactor";
import type { GenerationMessage, } from "../generation/gen-types-options";
import { PRIORITY, } from "./prompt/types";
import type { PromptSectionReport, } from "./prompt/types";

/**
 * Compact conversation history when prompt exceeds token budget.
 *
 * After the assembler drops low-priority sections, if the remaining messages
 * still exceed the budget, the ContextCompactor summarizes the older half
 * of chat history into a single system message.
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

/**
 * Drop lowest-priority sections until the assembled prompt fits the budget.
 *
 * Sections are dropped in descending priority order (lowest first); the
 * updated total token count is returned.
 * @param sections
 * @param tokenBudget
 * @param totalTokens
 * @returns void
 */
export function dropOverBudgetSections(
  sections: PromptSectionReport[],
  tokenBudget: number,
  totalTokens: number,
  // `?? 0`, not a high default: unknown section names fail the `> 0` gate
  // and stay immune from dropping (contract: prompt-budget.test.ts). The
  // template-library refactor briefly defaulted to 99, which made any
  // unknown/renamed section name drop FIRST.
  priorityOf: (name: string,) => number = (name,) => PRIORITY[name as keyof typeof PRIORITY] ?? 0,
): number {
  const ordered: (PromptSectionReport & { index: number })[] = [];
  for (const [si, s,] of sections.entries()) {
    if (s.dropped) { continue; }
    if (priorityOf(s.name,) > 0) {
      ordered.push({ ...s, index: si, },);
    }
  }
  ordered.sort((a, b,) => priorityOf(b.name,) - priorityOf(a.name,));

  let remaining = totalTokens;
  for (const section of ordered) {
    if (remaining <= tokenBudget) { break; }
    section.dropped = true;
    sections[section.index]!.dropped = true;
    remaining -= section.tokens;
  }
  return remaining;
}

/**
 * Reorder assembled messages: dropped sections removed, system messages
 * spliced to the front (Jinja chat templates require all system messages
 * before any user/assistant message).
 *
 * `sections` and `messages` are 1:1 lockstep, so a dropped section means the
 * message at the same index is dropped too.
 * @param messages
 * @param sections
 * @returns void
 */
export function reorderPromptMessages(
  messages: GenerationMessage[],
  sections: PromptSectionReport[],
): GenerationMessage[] {
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
  return finalMessages;
}
