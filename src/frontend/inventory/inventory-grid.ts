// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Inventory grid/list rendering — pure functions over plain item data.
 *
 * No fetching here: callers (Alpine state, stories) supply the rows and
 * receive selection callbacks. DOM is built with `document.createElement`
 * so the battle-panel fake-dom test harness works unchanged.
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

/**
 * Render options for the inventory grid.
 */
export interface InventoryGridOptions {
  /** Tile grid (default) or compact rows. */
  view?: InventoryView;
  /** Sort key, defaults to name. */
  sort?: InventorySortKey;
  /** Active filter; empty matches everything. */
  filter?: InventoryFilter;
  /** Highlighted row id. */
  selectedId?: string | null;
  /** Called when a slot is clicked. */
  onSelect?: (itemId: string,) => void;
}

/**
 * Render the (filtered, sorted) rows into a container, grid or list style.
 * @param container Element to render into; previous children are replaced.
 * @param items Raw rows; filtering/sorting happen inside.
 * @param options View, sort, filter, selection, and click callback.
 * @returns {void}
 */
export function renderInventoryGrid(
  container: HTMLElement,
  items: InventoryItem[],
  options: InventoryGridOptions = {},
): void {
  const { view = "grid", sort = "name", filter = {}, selectedId = null, onSelect, } = options;
  const visible = sortItems(filterItems(items, filter,), sort,);
  container.replaceChildren();
  container.className = view === "list" ? "inventory-list" : "inventory-grid";
  if (visible.length === 0) {
    const empty = document.createElement("div",);
    empty.className = "inventory-empty";
    empty.textContent = "No items to display.";
    container.append(empty,);
    return;
  }

  for (const item of visible) {
    container.append(buildSlot(item, view, item.id === selectedId, onSelect,),);
  }
}

/**
 * Build one slot/row element.
 * @param item Row to render.
 * @param view Grid tile or list row.
 * @param selected Whether to mark the slot selected.
 * @param onSelect Click callback, if any.
 * @returns The slot element.
 */
function buildSlot(
  item: InventoryItem,
  view: InventoryView,
  selected: boolean,
  onSelect: ((itemId: string,) => void) | undefined,
): HTMLElement {
  const equipped = isItemEquipped(item,);
  const slot = document.createElement("div",);
  slot.className = `inventory-slot${selected ? " selected" : ""}${equipped ? " equipped" : ""}`;
  slot.setAttribute("data-item-id", item.id,);

  const name = document.createElement("span",);
  name.className = "inventory-slot-name";
  name.setAttribute("data-slot-part", "name",);
  name.textContent = item.name;
  slot.append(name,);

  const quantity = item.quantity ?? 1;
  if (quantity > 1) {
    const stack = document.createElement("span",);
    stack.className = "inventory-slot-quantity";
    stack.setAttribute("data-slot-part", "quantity",);
    stack.textContent = `×${quantity}`;
    slot.append(stack,);
  }

  const rarity = document.createElement("span",);
  const rarityName = item.rarity ?? "common";
  rarity.className = `inventory-slot-rarity rarity-${rarityName.toLowerCase()}`;
  rarity.setAttribute("data-slot-part", "rarity",);
  rarity.textContent = rarityName;
  slot.append(rarity,);

  if (equipped) {
    const badge = document.createElement("span",);
    badge.className = "inventory-slot-equipped";
    badge.setAttribute("data-slot-part", "equipped",);
    badge.textContent = "Equipped";
    slot.append(badge,);
  }

  if (view === "list") {
    const meta = document.createElement("span",);
    meta.className = "inventory-slot-meta";
    meta.setAttribute("data-slot-part", "meta",);
    meta.textContent = item.value == null ? item.itemType : `${item.itemType} · ${item.value}g`;
    slot.append(meta,);
  }

  if (onSelect) {
    slot.addEventListener("click", () => {
      onSelect(item.id,);
    },);
  }

  return slot;
}
