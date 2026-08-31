// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Items — Equip Slot & Encumbrance Helpers
 *
 * Equip layout constants and category→slot mapping shared by the
 * ActorItemsService and route layer.
 */
import type { ItemCategory, } from "../../db/enums";

/** Per-actor equip layout. */
export const EQUIP_SLOTS = ["weapon", "armor", "accessory",] as const;
/** */
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

/**
 * Slot an ItemCategory occupies when equipped.
 * @param category
 */
export function slotForCategory(category: ItemCategory,): EquipSlot | null {
  switch (category) {
    case "weapon": {
      return "weapon";
    }
    case "armor": {
      return "armor";
    }
    case "consumable":
    case "key_item":
    case "quest_item":
    case "material":
    case "tool":
    case "container":
    case "treasure":
    case "book":
    case "artifact":
    case "misc":
    case "other": {
      return "accessory";
    }
  }
}

/** Encumbrance levels. */
export const ENCUMBRANCE = {
  Light: "light",
  Medium: "medium",
  Overloaded: "overloaded",
} as const;
/** */
export type Encumbrance = (typeof ENCUMBRANCE)[keyof typeof ENCUMBRANCE];

/** Result of a carry check. */
export interface CarryStatus {
  carried: number;
  capacity: number;
  encumbrance: Encumbrance;
  canCarry: (additionalWeight: number,) => boolean;
}

/** Equip attempt result. */
export interface EquipResult {
  ok: boolean;
  itemId?: string;
  reason?: string;
}
