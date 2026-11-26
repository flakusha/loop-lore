// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor header section — the generating character's card
 * (name / description / personality / appearance / outfit / scenario).
 */
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

export const actorHeaderSection: SectionBuilder = {
  name: "actorHeader",
  enabled: () => true,
  build: (ctx,) => {
    const actor = ctx.actor;
    const headerParts: string[] = [];
    if (actor.display_name) { headerParts.push(`You are ${actor.display_name}.`,); }
    if (actor.description) { headerParts.push(`\nDescription: ${actor.description}`,); }
    // An imported card with no separate personality/appearance falls back to
    // its description - repeating the same text only bloats the prompt.
    if (actor.personality && actor.personality !== actor.description) {
      headerParts.push(`\nPersonality: ${actor.personality}`,);
    }

    if (actor.appearance && actor.appearance !== actor.description) {
      headerParts.push(`\nAppearance: ${actor.appearance}`,);
    }

    if (actor.default_outfit) { headerParts.push(`\nOutfit: ${actor.default_outfit}`,); }
    if (actor.scenario) { headerParts.push(`\nScenario: ${actor.scenario}`,); }

    return headerParts.length > 0
      ? [{ role: "system", content: wrapSection("actor_header", headerParts.join("",),), },]
      : [];
  },
};
