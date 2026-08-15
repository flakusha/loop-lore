/**
 * Internal Traits Section — injects character internal state into the prompt.
 *
 * Reads aspirations, moral disposition, autonomy preferences, coping
 * mechanisms, approach tendencies, and voice patterns from the
 * `character_internal_traits` table. Only includes fields the character
 * is open about (per visibility config).
 *
 * See .plan/epics/epic-character-internal-traits.md
 */
import { CharacterInternalTraitsService, } from "../../../characters/services/internal-traits";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

export const internalTraitsSection: SectionBuilder = {
  name: "internalTraits",
  // Always enabled — build() returns [] when no traits exist
  enabled: () => true,
  build: async (ctx,) => {
    try {
      const svc = new CharacterInternalTraitsService(ctx.db,);
      const section = await svc.buildPromptSection(ctx.actor.id, false,);

      if (!section) { return []; }

      return [
        {
          role: "system",
          content: wrapSection("internal_traits", section,),
        },
      ];
    } catch {
      // Table may not exist in test DBs or before migration
      return [];
    }
  },
};
