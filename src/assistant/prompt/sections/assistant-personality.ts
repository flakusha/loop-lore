// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Assistant personality section — injects the composed voice block for the
 * chat's chosen assistant personality (preset or character-as-assistant).
 *
 * The block is pre-composed and pre-wrapped by `personality/composer`, so this
 * section is a pure pass-through: it fires only when the assembler resolved a
 * voice, which keeps `server-default` chats byte-identical to today.
 */
import type { SectionBuilder, } from "../types";

export const assistantPersonalitySection: SectionBuilder = {
  name: "assistantPersonality",
  enabled: (ctx,) => !!ctx.params.assistantPersonality,
  build: (ctx,) => {
    const block = ctx.params.assistantPersonality;
    if (!block) { return []; }
    return [{ role: "system", content: block, },];
  },
};
