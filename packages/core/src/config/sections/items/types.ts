// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ItemCategory, ItemRarity, } from "@/db/enums";

/** */
export interface ItemTemplate {
  /** Hard ID for deterministic test reseeding (optional — generated if omitted) */
  id?: string;
  /** Display name (required) */
  name: string;
  /** Item description */
  description?: string;
  /** Unified item taxonomy category (required) */
  category: ItemCategory;
  /** Rarity. Default "common" */
  rarity?: ItemRarity;
  /** Whether instances stack. Default false */
  stackable?: boolean;
  /** Max stack size when stackable. Default 1 */
  maxStack?: number;
  /** Gold value. Default 0 */
  value?: number;
  /** Weight. Default 0 */
  weight?: number;
  /** Stats, effects, damage, ac, etc. */
  properties?: Record<string, unknown>;
  /** Free-form tags */
  tags?: string[];
  /** Creator attribution */
  creator?: string;
  /** Restrict seeding to one world (world id or name). Omit = seed into every world */
  world?: string;
}

/** */
export interface ItemsDefaultsShape {
  enabled: boolean;
  templates: ItemTemplate[];
}
