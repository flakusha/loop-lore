// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC presentation helpers — disposition/relationship colors, tier and karma
 * labels, relationship partitioning. Pure; spread into the NPC component.
 */
import type { NpcRelationship, } from "./chat-types/npc";
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

  playerRelationships(relationships: NpcRelationship[],): NpcRelationship[] {
    return relationships.filter((r,) => r.fromId === "player" || r.toId === "player");
  },

  npcRelationships(relationships: NpcRelationship[],): NpcRelationship[] {
    return relationships.filter((r,) => r.fromId !== "player" && r.toId !== "player");
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
