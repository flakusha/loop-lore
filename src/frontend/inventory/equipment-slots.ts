// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Equipment loadout render — pure function over equipped rows.
 * Eight visual slots; backend `slotForCategory` only knows
 * weapon/armor/accessory, so `SLOT_FOR_TYPE` maps every item type onto the
 * closest visual slot and an explicit `metadata.slot` override wins.
 */
import { jsonParseOr, } from "../alpine/json.js";
import { type InventoryItem, isItemEquipped, } from "./inventory-grid.js";
import { itemStatEntries, } from "./item-details.js";

/** Visual loadout slots in render order. */
export const EQUIPMENT_SLOTS = [
  "head",
  "chest",
  "legs",
  "feet",
  "hands",
  "weapon",
  "shield",
  "accessory",
] as const;
/** One rendered loadout position. */
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

/** Closest visual slot for an item type; unknown types land on accessory. */
const SLOT_FOR_TYPE: Record<string, EquipmentSlot> = {
  weapon: "weapon",
  armor: "chest",
  accessory: "accessory",
};

/**
 * Slot an item occupies: explicit `metadata.slot` when it names a real slot,
 * else the item-type fallback.
 * @param item Row to place.
 * @returns The visual slot, accessory when unknown.
 */
export function slotForItem(item: InventoryItem,): EquipmentSlot {
  const metadata = typeof item.metadata === "string" ? jsonParseOr<unknown>(item.metadata, null,) : item.metadata;
  const override = metadata != null && typeof metadata === "object" && !Array.isArray(metadata,)
    ? (metadata as Record<string, unknown>)["slot"]
    : undefined;

  if (typeof override === "string" && (EQUIPMENT_SLOTS as readonly string[]).includes(override,)) {
    return override as EquipmentSlot;
  }

  const fallback = typeof item.itemType === "string" ? SLOT_FOR_TYPE[item.itemType.toLowerCase()] : undefined;
  return fallback ?? "accessory";
}

/** Quick equip/unequip callbacks for the loadout buttons. */
export interface EquipmentSlotActions {
  onEquip?: (itemId: string,) => void;
  onUnequip?: (itemId: string,) => void;
}

/**
 * Group rows by visual slot; rows already equipped win ties, later rows win
 * within the same equipped state so the newest equip shows.
 * @param items Rows to place (equipped endpoint rows or the full list).
 * @returns One row per occupied slot.
 */
export function loadoutBySlot(items: InventoryItem[],): Partial<Record<EquipmentSlot, InventoryItem>> {
  const loadout: Partial<Record<EquipmentSlot, InventoryItem>> = {};
  for (const item of items) {
    const slot = slotForItem(item,);
    const current = loadout[slot];
    if (current && isItemEquipped(current,) && !isItemEquipped(item,)) { continue; }
    loadout[slot] = item;
  }

  return loadout;
}

/**
 * Render the equipment loadout into a container; previous children replaced.
 * Every slot renders (empty slots show a placeholder); equipped item names
 * carry stat entries as a title tooltip, and each slot gets an equip/unequip
 * button only when that callback exists.
 * @param container Element to render into.
 * @param items Rows to place.
 * @param actions Quick equip/unequip callbacks.
 * @returns {void}
 */
export function renderEquipmentSlots(
  container: HTMLElement,
  items: InventoryItem[],
  actions: EquipmentSlotActions = {},
): void {
  const loadout = loadoutBySlot(items,);
  container.replaceChildren();
  container.className = "equipment-loadout";
  for (const slot of EQUIPMENT_SLOTS) {
    container.append(buildSlot(slot, loadout[slot] ?? null, actions,),);
  }
}

/**
 * Build one loadout slot element.
 * @param slot Slot name.
 * @param item Row occupying it, or null for the empty state.
 * @param actions Quick equip/unequip callbacks.
 * @returns The slot element.
 */
function buildSlot(
  slot: EquipmentSlot,
  item: InventoryItem | null,
  actions: EquipmentSlotActions,
): HTMLElement {
  const el = document.createElement("div",);
  el.className = `equipment-slot${item ? "" : " empty"}`;
  el.setAttribute("data-equip-slot", slot,);

  const label = document.createElement("span",);
  label.className = "equipment-slot-label";
  label.setAttribute("data-slot-part", "label",);
  label.textContent = slot;
  el.append(label,);

  const name = document.createElement("span",);
  name.className = "equipment-slot-item";
  name.setAttribute("data-slot-part", "item",);
  if (item) {
    name.textContent = item.name;
    const stats = itemStatEntries(item,).map((entry,) => `${entry.label}: ${entry.value}`);
    if (stats.length > 0) { name.setAttribute("title", stats.join("; ",),); }
  } else {
    name.textContent = "Empty";
  }

  el.append(name,);

  const action = item ? (isItemEquipped(item,) ? "unequip" : "equip") : null;
  const callback = item ? (isItemEquipped(item,) ? actions.onUnequip : actions.onEquip) : undefined;
  if (item && action && callback) {
    const button = document.createElement("button",);
    button.className = `equipment-slot-action action-${action}`;
    button.setAttribute("data-slot-action", action,);
    button.textContent = action === "equip" ? "Equip" : "Unequip";
    button.addEventListener("click", () => {
      callback(item.id,);
    },);

    el.append(button,);
  }

  return el;
}
