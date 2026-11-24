// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Output-language section — directs the general LLM to respond in the
 * chat's content language.
 *
 * Per-chat key: `gm_config.contentLanguage` (online-mutable presentation
 * key like carriageEnabled — no migration, no new column), with a
 * read-through fallback to the shipped `story_state.autoTranslateLang`
 * so existing chats keep working. Absent/malformed → section returns []
 * (byte-identical baseline). This is a generation directive only; it
 * never gates or suppresses content. Native-locale models comply
 * directly; others fall through to the translator-role post-generation
 * step (FEAT-language-selection-three-level).
 */
import { LANGUAGES, } from "../../../assistant/commands/translate";
import { readChatContentLanguage, } from "../../../chat/translation-target";
import type { SectionBuilder, } from "../types";

/** */
export const outputLanguageSection: SectionBuilder = {
  name: "outputLanguage",
  enabled: () => true,
  build: async (ctx,) => {
    // gm_config rides the AssembleChat projection. When it does not resolve
    // a language, ONE select fetches both rungs so the legacy story_state
    // fallback no longer costs a second round trip.
    const projected = ctx.chat.gm_config;
    const row = readChatContentLanguage(projected, null,)
      ? null
      : await ctx.db
        .selectFrom("chats",)
        .select(["gm_config", "story_state",],)
        .where("id", "=", ctx.chat.id,)
        .executeTakeFirst();

    const gmConfig = projected ?? row?.gm_config ?? null;
    const locale = readChatContentLanguage(gmConfig, row?.story_state,);
    if (!locale) { return []; }

    return directive(locale,);
  },
};

/**
 * Render the respond-in-language directive block.
 * @param locale - resolved catalog locale
 * @returns system message block
 */
function directive(locale: string,): Array<{ role: "system"; content: string }> {
  const langName = LANGUAGES[locale] ?? locale;
  return [{
    role: "system",
    content: `Language directive: respond in ${langName} (${locale}). ` +
      "Write ALL of your reply in this language, including narration and dialogue.",
  },];
}
