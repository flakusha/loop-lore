// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Outfit Context Section — injects the current outfit into the prompt so
 * narration/GM output can reference wardrobe changes (the outfit analog of
 * `emotion-avatar.ts`, TASK-wardrobe-story-gm-integration-outfit-change-events).
 *
 * Fires when the assembler resolved a wardrobe outfit for this chat
 * (chat override > location rule > character default). Emotion-only
 * characters resolve no outfit and stay untouched.
 */
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

/** Human labels for the outfit resolution source. */
const SOURCE_LABELS: Record<string, string> = {
  chat_override: "scene override",
  location_rule: "location rule",
  equipped_loadout: "equipped loadout",
  default: "character default",
};

export const outfitContextSection: SectionBuilder = {
  name: "outfitContext",
  enabled: (ctx,) => ctx.params.outfit !== undefined,
  build: (ctx,) => {
    const outfit = ctx.params.outfit;
    if (outfit === undefined) { return []; }

    const source = ctx.params.outfitSource;
    const sourceLabel = source ? SOURCE_LABELS[source] ?? source : undefined;
    const lines = [`Current outfit: ${outfit}`,];
    if (sourceLabel) {
      lines.push(`Outfit selected by: ${sourceLabel}`,);
    }

    return [
      {
        role: "system",
        content: wrapSection("outfit_context", lines.join("\n",),),
      },
    ];
  },
};
