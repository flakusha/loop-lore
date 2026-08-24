// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Task-clarification section — injects a `[Task]` system block stating what
 * the LLM is currently doing, derived from the generation context.
 *
 * Placement: right after the system section (system role), so it stays near
 * the front after `reorderPromptMessages` relocates system-role messages.
 * Priority 0 — never dropped under token budget.
 *
 * XML-delimited to prevent prompt injection via the wrapped content.
 */
import { buildTaskClarification, } from "../../../prompts/task-clarification";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

export const taskClarificationSection: SectionBuilder = {
  name: "taskClarification",
  enabled: (ctx,) => ctx.task !== null,
  build: (ctx,) => {
    // Defensive: `enabled` should have gated this, but if a caller builds the
    // section directly we still honor `task: null` as opt-out.
    if (ctx.task === null) { return []; }
    const isCharacter = ctx.actor.type === "character";
    const isGM = ctx.task === "gm-decision";
    const content = buildTaskClarification({
      task: ctx.task ?? "chat-reply",
      action: ctx.action,
      chatMode: ctx.chat.mode,
      characterName: isCharacter && !isGM ? ctx.actor.display_name : null,
      assistantName: ctx.assistantName ?? (isCharacter || isGM ? null : ctx.actor.display_name),
      gmName: ctx.gmName ?? (isGM ? ctx.actor.display_name : null),
    },);
    return [{ role: "system", content: wrapSection("task", content,), },];
  },
};
