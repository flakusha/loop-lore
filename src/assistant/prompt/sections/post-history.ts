// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Post-history instructions section — actor-specific guidance appended after
 * the conversation history.
 *
 * Rendered as `role: "user"` (not `system`) so `reorderPromptMessages` does
 * not splice it to the front of the prompt. Combined with the registry order
 * (placed AFTER `chatHistorySection`), the post-history instructions land at
 * the end of the assembled messages — matching the documented SillyTavern
 * semantics ("instructions appended after chat history") and the intent
 * stated in this section's JSDoc.
 */
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

export const postHistorySection: SectionBuilder = {
  name: "postHistory",
  enabled: (ctx,) => !!ctx.actor.post_history_instructions,
  build: (ctx,) => {
    const instr = ctx.actor.post_history_instructions;
    if (!instr) { return []; }
    return [{ role: "user", content: wrapSection("post_history", instr,), },];
  },
};
