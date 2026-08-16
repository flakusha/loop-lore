// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Author's Note section — injects persistent instruction from the actor's
 * `post_history_instructions` field into the prompt context.
 *
 * Placement: injected after character header, before messages (system role).
 * When `post_history_instructions` is null/empty, the section is skipped.
 *
 * XML-delimited to prevent prompt injection via the wrapped content.
 */
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

export const authorNoteSection: SectionBuilder = {
  name: "author-note",
  enabled: (ctx,) => {
    const note = ctx.actor.post_history_instructions;
    return !!note && note.trim().length > 0;
  },
  // eslint-disable-next-line @typescript-eslint/require-await -- PromptSection.build is typed Promise<Message[]>
  build: async (ctx,) => {
    const note = ctx.actor.post_history_instructions!;
    const wrappedNote = wrapSection("author_note", note,);
    return [{ role: "system", content: wrappedNote, },];
  },
};
