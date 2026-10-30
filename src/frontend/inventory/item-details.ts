// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Item details panel — pure render over one inventory row.
 *
 * Action buttons invoke callbacks passed by the caller; this module never
 * touches the network. Effect/stat rows come from the item's `metadata`
 * JSON (when present) so backend stat schemas can evolve without breaking
 * the panel: unknown shapes render as `key: value` lines.
 */
import { jsonParseOr, safeJsonStringify, } from "../alpine/json.js";
import { type InventoryItem, isItemEquipped, isItemUsable, itemTags, } from "./inventory-grid.js";

/** Stat/effect entry extracted from item metadata. */
export interface ItemStatEntry {
  label: string;
  value: string;
}

/** Action callbacks for the details panel buttons. */
export interface ItemDetailsActions {
  onUse?: (itemId: string,) => void;
  onEquip?: (itemId: string,) => void;
  onUnequip?: (itemId: string,) => void;
  onDrop?: (itemId: string,) => void;
}

/**
 * Decode the stats/effects block from an item's metadata field.
 * Accepts a record, a JSON string, or nullish; unknown shapes yield [].
 * Known keys (`stats`, `effects`, `abilities`, `requirements`) flatten to
 * `label: value` entries; any other record renders one entry per key.
 * @param item Row to decode metadata from.
 * @returns Label/value entries, possibly empty.
 */
export function itemStatEntries(item: InventoryItem,): ItemStatEntry[] {
  const record = metadataRecord(item.metadata,);
  if (!record) { return []; }
  const entries: ItemStatEntry[] = [];
  for (const section of ["stats", "effects", "abilities", "requirements",]) {
    const block = record[section];
    if (block == null) { continue; }
    entries.push(...blockEntries(section, block,),);
  }

  const known = new Set(["stats", "effects", "abilities", "requirements",],);
  for (const [key, value,] of Object.entries(record,)) {
    if (known.has(key,)) { continue; }
    entries.push({ label: key, value: displayValue(value,), },);
  }

  return entries;
}

/**
 * Coerce metadata (record or JSON string) to a plain record.
 * @param metadata Raw metadata field.
 * @returns The record, or null when absent/unparseable.
 */
function metadataRecord(metadata: InventoryItem["metadata"],): Record<string, unknown> | null {
  if (!metadata) {
    return null;
  }

  if (typeof metadata === "object") {
    return metadata as Record<string, unknown>;
  }

  const parsed = jsonParseOr<unknown>(metadata, null,);

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed,)) {
    return parsed as Record<string, unknown>;
  }

  return null;
}

/**
 * Flatten one metadata block (record or list) to label/value entries.
 * @param section Block name, used as the label prefix for list entries.
 * @param block Block value.
 * @returns Entries for the block.
 */
function blockEntries(section: string, block: unknown,): ItemStatEntry[] {
  if (Array.isArray(block,)) {
    return block.map((entry,) => ({ label: section, value: displayValue(entry,), }));
  }

  if (block && typeof block === "object") {
    return Object.entries(block as Record<string, unknown>,).map(([key, value,],) => ({
      label: key,
      value: displayValue(value,),
    }));
  }

  return [{ label: section, value: displayValue(block,), },];
}

/**
 * Display-coerce a metadata value.
 * @param value Raw value.
 * @returns Human-readable string.
 */
function displayValue(value: unknown,): string {
  if (value == null) {
    return "—";
  }

  if (typeof value === "string") {
    return value;
  }

  const encoded = safeJsonStringify(value,);

  return encoded.ok ? encoded.value : String(value,);
}

/**
 * Render the details panel into a container; empty state when item is null.
 * Buttons appear only for the callbacks the caller supplies (use/equip-or-
 * unequip/drop); every button is a plain `<button>` firing the callback.
 * @param container Element to render into; previous children are replaced.
 * @param item Row to display, or null for the empty state.
 * @param actions Action callbacks for the buttons.
 * @returns {void}
 */
export function renderItemDetails(
  container: HTMLElement,
  item: InventoryItem | null,
  actions: ItemDetailsActions = {},
): void {
  container.replaceChildren();
  container.className = "item-details";
  if (!item) {
    const empty = document.createElement("div",);
    empty.className = "item-details-empty";
    empty.setAttribute("data-details-part", "empty",);
    empty.textContent = "Select an item to see details.";
    container.append(empty,);
    return;
  }

  container.append(
    heading(item,),
    factsRow(item,),
    descriptionBlock(item,),
    statsBlock(item,),
    actionsBlock(item, actions,),
  );
}

/**
 * Build the title heading with rarity class.
 * @param item Row to display.
 * @returns Heading element.
 */
function heading(item: InventoryItem,): HTMLElement {
  const title = document.createElement("h3",);
  const rarityName = item.rarity ?? "common";
  title.className = `item-details-title rarity-${rarityName.toLowerCase()}`;
  title.setAttribute("data-details-part", "title",);
  title.textContent = item.name;
  return title;
}

/**
 * Build the type/rarity/value/weight fact line.
 * @param item Row to display.
 * @returns Facts element.
 */
function factsRow(item: InventoryItem,): HTMLElement {
  const facts = document.createElement("div",);
  facts.className = "item-details-facts";
  facts.setAttribute("data-details-part", "facts",);
  const parts = [
    `Type: ${item.itemType}`,
    `Rarity: ${item.rarity ?? "common"}`,
    item.value == null ? null : `Value: ${item.value}g`,
    item.weight == null ? null : `Weight: ${item.weight}`,
    isItemEquipped(item,) ? "Equipped" : null,
  ].filter((part,): part is string => part !== null);

  facts.textContent = parts.join(" · ",);
  const tags = itemTags(item,);
  if (tags.length > 0) {
    const tagLine = document.createElement("div",);
    tagLine.className = "item-details-tags";
    tagLine.setAttribute("data-details-part", "tags",);
    tagLine.textContent = tags.join(", ",);
    facts.append(tagLine,);
  }

  return facts;
}

/**
 * Build the description block; skipped when the row has none.
 * @param item Row to display.
 * @returns Description element, or an empty comment-free placeholder.
 */
function descriptionBlock(item: InventoryItem,): HTMLElement {
  const block = document.createElement("div",);
  block.className = "item-details-description";
  block.setAttribute("data-details-part", "description",);
  block.textContent = item.description?.trim() ? item.description : "No description.";
  return block;
}

/**
 * Build the stats/effects list from metadata; empty block when none.
 * @param item Row to display.
 * @returns Stats element.
 */
function statsBlock(item: InventoryItem,): HTMLElement {
  const block = document.createElement("div",);
  block.className = "item-details-stats";
  block.setAttribute("data-details-part", "stats",);
  const entries = itemStatEntries(item,);
  if (entries.length === 0) {
    block.textContent = "No stats.";
    return block;
  }

  const list = document.createElement("ul",);
  for (const entry of entries) {
    const row = document.createElement("li",);
    row.textContent = `${entry.label}: ${entry.value}`;
    list.append(row,);
  }

  block.append(list,);
  return block;
}

/**
 * Build the action button row from the supplied callbacks.
 * Use shows for usable items, equip/unequip toggles on equipped state.
 * @param item Row to display.
 * @param actions Callbacks; a button renders only when its callback exists.
 * @returns Actions element (empty when no callbacks).
 */
function actionsBlock(item: InventoryItem, actions: ItemDetailsActions,): HTMLElement {
  const block = document.createElement("div",);
  block.className = "item-details-actions";
  block.setAttribute("data-details-part", "actions",);
  const buttons: [
    action: keyof ItemDetailsActions,
    label: string,
    callback: ((itemId: string,) => void) | undefined,
  ][] = [
    ["onUse", "Use", actions.onUse,],
    isItemEquipped(item,) ? ["onUnequip", "Unequip", actions.onUnequip,] : ["onEquip", "Equip", actions.onEquip,],
    ["onDrop", "Drop", actions.onDrop,],
  ];

  for (const [kind, label, callback,] of buttons) {
    if (kind === "onUse" && !isItemUsable(item,)) { continue; }
    if (!callback) { continue; }
    const button = document.createElement("button",);
    button.className = `item-details-action action-${kind.replace("on", "",).toLowerCase()}`;
    button.setAttribute("data-details-action", kind,);
    button.textContent = label;
    button.addEventListener("click", () => {
      callback(item.id,);
    },);

    block.append(button,);
  }

  return block;
}
