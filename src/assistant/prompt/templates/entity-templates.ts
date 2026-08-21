// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation prompt templates for `/create` entity kinds.
 *
 * Each template provides:
 *   - `schema` — the required JSON fields and their types (used as prompt guidance)
 *   - `example` — a minimal valid instance (used as an in-prompt example)
 *
 * These structs are consumed by {@link resolveEntityGenerationPrompt} to build
 * the user-facing generation prompt for each entity kind.
 */

import type { EntityKind, } from "./entity-generation";

/** Minimal template describing required fields and an example for one entity kind. */
export interface EntityTemplate {
  /** Human-readable schema description for the prompt. */
  schema: string;
  /** Minimal valid JSON example for the prompt. */
  example: Record<string, unknown>;
}

/** Template registry keyed by canonical entity kind. */
export const ENTITY_TEMPLATES: Record<EntityKind, EntityTemplate> = {
  character: {
    schema:
      `name (string, required), description (string, required, 1-2 paragraphs), personality (string), scenario (string, 1 sentence)`,
    example: {
      name: "Eldric the Wanderer",
      description:
        "A grizzled half-elf ranger with silver-streaked hair and a limp from an old battle. Speaks in short, deliberate sentences.",
      personality: "Cautious, dry-humored, fiercely loyal to companions.",
      scenario: "Approaches the party at a crossroads inn, looking for leads on a missing caravans.",
    },
  },
  location: {
    schema: `name (string, required), description (string, required, 1-2 paragraphs)`,
    example: {
      name: "The Sunken Bridge",
      description:
        "An ancient stone bridge half-submerged in murky water, its railings crumbling. Bioluminescent moss clings to the underside, casting a faint blue glow at night.",
    },
  },
  world: {
    schema: `name (string, required), description (string, required, 1-2 paragraphs), lore (string, 1 paragraph)`,
    example: {
      name: "The Shattered Realms",
      description:
        "A fractured continent of floating islands connected by magical bridges of solidified light. Weather varies wildly between islands.",
      lore:
        "The cataclysm that shattered the realm was caused by the Betrayer's misuse of the Resonance Crystal, which now lies dormant beneath the capital.",
    },
  },
  item: {
    schema: `name (string, required), description (string, required, 1 paragraph)`,
    example: {
      name: "Whisperwind Pendant",
      description:
        "A pale blue crystal pendant on a thin silver chain. When squeezed, it allows the wearer to speak without making a sound for up to one minute.",
    },
  },
};
