// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Output Style section — injects the resolved genre/register/tone directive
 * into the system context when a style is configured.
 *
 * Disabled unless a style resolved (mirrors authorNoteSection gating on
 * post_history_instructions) so existing prompts are unaffected. XML-delimited
 * for prompt-injection safety.
 */
import { buildStyleDirective, } from "../../../chat/output-style";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

export const styleSection: SectionBuilder = {
  name: "output-style",
  enabled: (ctx,) => !!ctx.outputStyle,
  build: (ctx,) => {
    const cfg = ctx.outputStyle!;
    return [{ role: "system", content: wrapSection("output_style", buildStyleDirective(cfg,),), },];
  },
};
