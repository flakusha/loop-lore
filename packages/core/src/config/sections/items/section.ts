// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { ITEMS_DEFAULTS, } from "./defaults.js";
import type { ItemTemplate, } from "./types.js";

/** */
export class ItemsSection {
  enabled = ITEMS_DEFAULTS.enabled;
  templates: ItemTemplate[] = ITEMS_DEFAULTS.templates;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<ItemsSection>,) {
    Object.assign(this, overrides,);
  }
}

export type ItemsConfig = ItemsSection;

export const itemsMeta = {
  type: "object" as const,
  description: "Item template configuration — default item definitions seeded on app start",
  properties: {
    enabled: {
      type: "boolean",
      default: ITEMS_DEFAULTS.enabled,
      description: "Enable item template seeding",
    },
    templates: {
      type: "array",
      description: "Default item templates to seed on first start",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Hard ID for deterministic test reseeding", },
          name: { type: "string", description: "Item display name", },
          description: { type: "string", description: "Item description", },
          category: {
            type: "string",
            enum: [
              "weapon",
              "armor",
              "consumable",
              "key_item",
              "quest_item",
              "material",
              "tool",
              "container",
              "treasure",
              "book",
              "artifact",
              "misc",
              "other",
            ],
            description: "Unified item taxonomy category",
          },
          rarity: {
            type: "string",
            enum: ["common", "uncommon", "rare", "epic", "legendary", "unique", "artifact",],
            default: "common",
            description: "Item rarity",
          },
          stackable: { type: "boolean", default: false, description: "Whether instances stack", },
          maxStack: { type: "number", default: 1, description: "Max stack size when stackable", },
          value: { type: "number", default: 0, description: "Gold value", },
          weight: { type: "number", default: 0, description: "Weight", },
          properties: {
            type: "object",
            description: "Stats, effects, damage, ac, etc.",
            additionalProperties: true,
          },
          tags: { type: "array", items: { type: "string", }, description: "Free-form tags", },
          creator: { type: "string", description: "Creator attribution", },
          world: {
            type: "string",
            description: "Restrict seeding to one world (world id or name). Omit = seed into every world",
          },
        },
        required: ["name", "category",],
      },
    },
  },
  required: ["enabled", "templates",] as const,
};
