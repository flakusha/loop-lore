// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC presentation helpers — disposition/relationship colors, tier and karma
 * labels, relationship row mapping. Pure; spread into the NPC component.
 */
import type { ActorRelationshipRow, RelationshipDisplayRow, } from "./chat-types/npc";
import { STANDING_TIERS, } from "./npc-mock.js";

export const npcDisplay = {
  getDispositionColor(disposition: string,): string {
    switch (disposition) {
      case "hostile": {
        return "var(--accent-red)";
      }

      case "unfriendly": {
        return "var(--accent-orange)";
      }

      case "neutral": {
        return "var(--text-muted)";
      }

      case "friendly": {
        return "var(--accent-green)";
      }

      case "honored": {
        return "var(--accent-blue)";
      }

      case "revered": {
        return "var(--accent-purple)";
      }

      case "exalted": {
        return "var(--accent-gold)";
      }

      default: {
        return "var(--text-muted)";
      }
    }
  },

  getDispositionLabel(disposition: string,): string {
    return disposition.charAt(0,).toUpperCase() + disposition.slice(1,);
  },

  getRelationshipColor(type: string,): string {
    switch (type) {
      case "friend": {
        return "var(--accent-green)";
      }

      case "ally": {
        return "var(--accent-blue)";
      }

      case "rival": {
        return "var(--accent-orange)";
      }

      case "enemy": {
        return "var(--accent-red)";
      }

      case "mentor": {
        return "var(--accent-purple)";
      }

      default: {
        return "var(--text-muted)";
      }
    }
  },

  getStrengthLabel(strength: number,): string {
    const abs = Math.abs(strength,);
    if (abs >= 75) { return "Strong"; }
    if (abs >= 50) { return "Moderate"; }
    if (abs >= 25) { return "Weak"; }
    return "Minimal";
  },

  /**
   * Map wire relationship rows to display rows, resolving target names.
   * @param relationships - rows from the relationships API
   * @param opts.resolveName - actor id to display name resolver
   * @param opts.unknownLabel - label used when a target actor is not in the cast
   * @returns display rows in API order
   */
  relationshipRows(
    relationships: ActorRelationshipRow[],
    { resolveName, unknownLabel, }: { resolveName: (id: string,) => string; unknownLabel: string },
  ): RelationshipDisplayRow[] {
    return Array.from(relationships, (r,) => ({
      id: r.id,
      targetName: resolveName(r.targetActorId,) || unknownLabel,
      type: r.relationshipType,
      standing: r.standing,
      trust: r.trust,
      familiarity: r.familiarity,
      isBidirectional: r.isBidirectional,
    }),);
  },

  getFactionStandingColor(standing: number,): string {
    for (const tier of STANDING_TIERS) {
      if (standing >= tier.min && standing <= tier.max) { return tier.color; }
    }

    return "var(--text-muted)";
  },

  getFactionTier(standing: number,): string {
    for (const tier of STANDING_TIERS) {
      if (standing >= tier.min && standing <= tier.max) { return tier.name; }
    }

    return "Neutral";
  },

  getKarmaLabel(value: number,): string {
    if (value >= 75) { return "Saintly"; }
    if (value >= 50) { return "Good"; }
    if (value >= 25) { return "Fair"; }
    if (value >= 0) { return "Neutral"; }
    if (value >= -25) { return "Dubious"; }
    if (value >= -50) { return "Wicked"; }
    return "Evil";
  },

  getKarmaColor(value: number,): string {
    if (value >= 50) { return "var(--accent-green)"; }
    if (value >= 0) { return "var(--text-muted)"; }
    return "var(--accent-red)";
  },

  karmaPercent(value: number,): number {
    return Math.round(((value + 100) / 200) * 100,);
  },
};
