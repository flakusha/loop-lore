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

/** Schema text for a single lore entry, reused across all entity templates. */
const LORE_ENTRY_SCHEMA =
  `name (string, required), content (string, required), keys (array of strings, max 5, each <= 100 chars), subject (object: { kind: "world"|"location"|"profession"|"race", ... with non-empty selectors }), requires_presence (boolean), constant (boolean), selective (boolean), position ("before_char"|"after_char"|"in_char"), insertion_order (integer, >= 0), priority (integer, -999..999), cooldown_seconds (integer, >= 0)`;

/** Template registry keyed by canonical entity kind. */
export const ENTITY_TEMPLATES: Record<EntityKind, EntityTemplate> = {
  character: {
    schema:
      `name (string, required), description (string, required, 1-2 paragraphs), personality (string), scenario (string, 1 sentence), lore (array of lore entries, optional) — each entry: ${LORE_ENTRY_SCHEMA}`,
    example: {
      name: "Eldric the Wanderer",
      description:
        "A grizzled half-elf ranger with silver-streaked hair and a limp from an old battle. Speaks in short, deliberate sentences.",
      personality: "Cautious, dry-humored, fiercely loyal to companions.",
      scenario: "Approaches the party at a crossroads inn, looking for leads on a missing caravans.",
      lore: [
        {
          name: "The Betrayer's Tale",
          content: "Eldric once served the Betrayer, a fact he hides in shame.",
          keys: ["betrayer", "shame",],
          subject: { kind: "race", race: "elf", },
          requires_presence: true,
          constant: false,
          selective: true,
          position: "before_char",
          insertion_order: 0,
          priority: 0,
          cooldown_seconds: 0,
        },
      ],
    },
  },
  location: {
    schema:
      `name (string, required), description (string, required, 1-2 paragraphs), lore (array of lore entries, optional) — each entry: ${LORE_ENTRY_SCHEMA}`,
    example: {
      name: "The Sunken Bridge",
      description:
        "An ancient stone bridge half-submerged in murky water, its railings crumbling. Bioluminescent moss clings to the underside, casting a faint blue glow at night.",
      lore: [
        {
          name: "Bridge of Sorrows",
          content: "The bridge was built by drowned spirits who still haunt the waters below.",
          keys: ["drowned", "spirits",],
          requires_presence: true,
          constant: false,
          selective: true,
          position: "before_char",
        },
      ],
    },
  },
  world: {
    schema:
      `name (string, required), description (string, required, 1-2 paragraphs), lore (array of lore entries, optional) — each entry: ${LORE_ENTRY_SCHEMA}`,
    example: {
      name: "The Shattered Realms",
      description:
        "A fractured continent of floating islands connected by magical bridges of solidified light. Weather varies wildly between islands.",
      lore: [
        {
          name: "The Cataclysm",
          content:
            "The realm was shattered by the Betrayer's misuse of the Resonance Crystal, now dormant beneath the capital.",
          keys: ["cataclysm", "betrayer", "crystal",],
          subject: { kind: "world", },
          constant: true,
          selective: false,
          position: "before_char",
        },
      ],
    },
  },
  item: {
    schema:
      `name (string, required), description (string, required, 1 paragraph), lore (array of lore entries, optional) — each entry: ${LORE_ENTRY_SCHEMA}`,
    example: {
      name: "Whisperwind Pendant",
      description:
        "A pale blue crystal pendant on a thin silver chain. When squeezed, it allows the wearer to speak without making a sound for up to one minute.",
      lore: [
        {
          name: "The Bard's Tale",
          content: "Forged by a silenced bard who poured their remaining voice into the crystal.",
          keys: ["bard", "silenced",],
          subject: { kind: "race", race: "human", },
          requires_presence: true,
          constant: true,
          selective: false,
          position: "before_char",
        },
      ],
    },
  },
};
