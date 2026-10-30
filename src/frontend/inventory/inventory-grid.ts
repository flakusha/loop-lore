// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Inventory data helpers — pure functions over plain item rows.
 *
 * No fetching here: callers (Alpine state, stories) supply the rows.
 */
import { jsonParseOr, } from "../alpine/json.js";

/** One inventory row as returned by the actor-items list endpoint. */
export interface InventoryItem {
  id: string;
  name: string;
  itemType: string;
  rarity?: string | null;
  description?: string | null;
  quantity?: number | null;
  value?: number | null;
  weight?: number | null;
  equipped?: string | boolean | null;
  tags?: string[] | string | null;
  metadata?: Record<string, unknown> | string | null;
}

/** Sort keys supported by the inventory header. */
export type InventorySortKey = "name" | "type" | "rarity" | "value";

/** Grid tiles vs compact rows. */
export type InventoryView = "grid" | "list";

/** Filter state for the inventory header. */
export interface InventoryFilter {
  type?: string;
  rarity?: string;
  equippedOnly?: boolean;
  usableOnly?: boolean;
}

/** Rarity display order, lowest first. */
const RARITY_RANK: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  unique: 5,
  artifact: 6,
};

/**
 * Normalize the tags field (array, JSON string, or comma list) to an array.
 * @param item The row to read tags from.
 * @returns Lowercase tag list, empty when the row carries none.
 */
export function itemTags(item: InventoryItem,): string[] {
  const tags = item.tags;
  if (!tags) { return []; }
  const raw: string[] = Array.isArray(tags,) ? tags.map((tag,) => String(tag,)) : splitTags(String(tags,),);
  return raw.map((tag,) => tag.trim().toLowerCase()).filter((tag,) => tag.length > 0);
}

/**
 * Split a tags string: JSON array when it parses, comma list otherwise.
 * @param text Raw tags string.
 * @returns Candidate tag strings.
 */
function splitTags(text: string,): string[] {
  const trimmed = text.trim();

  if (trimmed.startsWith("[",)) {
    const parsed = jsonParseOr<unknown>(trimmed, null,);

    if (Array.isArray(parsed,)) {
      return parsed.map((tag,) => String(tag,));
    }
  }

  return trimmed.split(",",);
}

/**
 * Whether the row counts as equipped (`"equipped"` or `true`).
 * @param item The row to check.
 * @returns True when the item is currently equipped.
 */
export function isItemEquipped(item: InventoryItem,): boolean {
  return item.equipped === true || item.equipped === "equipped";
}

/**
 * Whether the row counts as directly usable (consumable/tool, or tagged).
 * @param item The row to check.
 * @returns True when the item can be used from the inventory.
 */
export function isItemUsable(item: InventoryItem,): boolean {
  const kind = item.itemType.toLowerCase();
  if (kind === "consumable" || kind === "tool") { return true; }
  return itemTags(item,).includes("usable",);
}

/**
 * Filter rows by type, rarity, equipped, and usable flags.
 * @param items Rows to filter.
 * @param filter Active filter; empty values match everything.
 * @returns A new array with only matching rows.
 */
export function filterItems(items: InventoryItem[], filter: InventoryFilter = {},): InventoryItem[] {
  return items.filter((item,) => {
    if (filter.type && item.itemType.toLowerCase() !== filter.type.toLowerCase()) { return false; }
    const rarity = (item.rarity ?? "common").toLowerCase();
    if (filter.rarity && rarity !== filter.rarity.toLowerCase()) { return false; }
    if (filter.equippedOnly && !isItemEquipped(item,)) { return false; }
    if (filter.usableOnly && !isItemUsable(item,)) { return false; }
    return true;
  },);
}

/**
 * Sort rows: name/type ascending, rarity/value descending, name as tiebreak.
 * @param items Rows to sort.
 * @param sort Sort key, defaults to name.
 * @returns A new sorted array; the input is untouched.
 */
export function sortItems(items: InventoryItem[], sort: InventorySortKey = "name",): InventoryItem[] {
  const byName = (a: InventoryItem, b: InventoryItem,): number => a.name.localeCompare(b.name,);
  return [...items,].sort((a, b,) => {
    switch (sort) {
      case "rarity":
        return rarityRank(b.rarity,) - rarityRank(a.rarity,) || byName(a, b,);
      case "value":
        return asNumber(b.value,) - asNumber(a.value,) || byName(a, b,);
      case "type":
        return a.itemType.localeCompare(b.itemType,) || byName(a, b,);
      default:
        return byName(a, b,);
    }
  },);
}

/**
 * Rank a rarity string for descending sort; unknown sorts below common.
 * @param rarity Rarity name or nullish.
 * @returns Rank number, -1 when unknown.
 */
function rarityRank(rarity: string | null | undefined,): number {
  if (!rarity) { return -1; }
  return RARITY_RANK[rarity.toLowerCase()] ?? -1;
}

/**
 * Coerce a numeric field for descending sort; nullish sorts last.
 * @param value Field value.
 * @returns The number, or -Infinity when absent.
 */
function asNumber(value: number | null | undefined,): number {
  return typeof value === "number" ? value : Number.NEGATIVE_INFINITY;
}
