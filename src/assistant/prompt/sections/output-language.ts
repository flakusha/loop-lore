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
    // gm_config rides the AssembleChat projection (prompt-assembler
    // loadProjections selects it) — prefer it, fall back to a live read so
    // direct section.build callers in tests stay covered. story_state is
    // only fetched when the gm_config rung yields nothing (read-through
    // fallback for legacy autoTranslateLang chats).
    const gmConfig = ctx.chat.gm_config ?? (await ctx.db
      .selectFrom("chats",)
      .select(["gm_config",],)
      .where("id", "=", ctx.chat.id,)
      .executeTakeFirst())?.gm_config ??
      null;

    if (readChatContentLanguage(gmConfig, null,)) {
      const locale = readChatContentLanguage(gmConfig, null,) ?? "";
      return directive(locale,);
    }

    const storyState = await ctx.db
      .selectFrom("chats",)
      .select(["story_state",],)
      .where("id", "=", ctx.chat.id,)
      .executeTakeFirst()
      .then((row,) => row?.story_state ?? null);

    const locale = readChatContentLanguage(gmConfig, storyState,);
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
