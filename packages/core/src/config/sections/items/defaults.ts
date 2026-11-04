// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 120

import type { ItemsDefaultsShape, ItemTemplate, } from "./types.js";

export const ITEMS_DEFAULTS: ItemsDefaultsShape = {
  enabled: true,
  templates: [
    // ── Weapon ─────────────────────────────────────────────
    {
      id: "item-iron-sword",
      name: "Iron Sword",
      description: "A sturdy, no-frills blade favored by soldiers and adventurers alike.",
      category: "weapon",
      rarity: "common",
      value: 15,
      weight: 3,
      properties: { damage: "1d8", damage_type: "slashing", },
      tags: ["weapon", "melee",],
      creator: "loop-lore",
    },

    // ── Armor ──────────────────────────────────────────────
    {
      id: "item-leather-armor",
      name: "Leather Armor",
      description: "Boiled-hide armor — light, quiet, and dependable.",
      category: "armor",
      rarity: "common",
      value: 10,
      weight: 10,
      properties: { ac: 11, armor_class_source: "leather", },
      tags: ["armor", "light",],
      creator: "loop-lore",
    },

    // ── Consumable ─────────────────────────────────────────
    {
      id: "item-health-potion",
      name: "Health Potion",
      description: "A ruby-red draught that knits wounds closed on drinking.",
      category: "consumable",
      rarity: "common",
      stackable: true,
      maxStack: 10,
      value: 50,
      weight: 0.5,
      properties: { healing: "2d4+2", effect: "heal", },
      tags: ["potion", "healing",],
      creator: "loop-lore",
    },

    // ── Tool ───────────────────────────────────────────────
    {
      id: "item-torch",
      name: "Torch",
      description: "A pitch-soaked rag on a stout stick. Burns bright, dies fast.",
      category: "tool",
      rarity: "common",
      stackable: true,
      maxStack: 20,
      value: 0.1,
      weight: 1,
      properties: { light_radius: 20, burn_minutes: 60, },
      tags: ["tool", "light",],
      creator: "loop-lore",
    },
    {
      id: "item-rope",
      name: "Hempen Rope",
      description: "Fifty feet of braided hemp — the adventurer's silent partner.",
      category: "tool",
      rarity: "common",
      value: 2,
      weight: 10,
      properties: { length_ft: 50, },
      tags: ["tool", "utility",],
      creator: "loop-lore",
    },

    // ── Treasure ───────────────────────────────────────────
    {
      id: "item-gold-ring",
      name: "Gold Ring",
      description: "A plain gold band, warm to the touch and unreasonably shiny.",
      category: "treasure",
      rarity: "uncommon",
      value: 100,
      weight: 0.1,
      properties: { material: "gold", },
      tags: ["treasure", "jewelry",],
      creator: "loop-lore",
    },
  ],
} satisfies ItemsDefaultsShape;

export type { ItemTemplate, };
