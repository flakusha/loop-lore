// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Inventory panel state (Phase 1: display; Phase 2: equipment loadout; trading arrives in Phase 3).
// Drives:
//   GET    /api/v1/actors/:actorId/items                       (list, paginated)
//   POST   /api/v1/actors/:actorId/items/:itemId/equip
//   POST   /api/v1/actors/:actorId/items/:itemId/unequip
//   POST   /api/v1/actors/:actorId/items/:itemId/transfer       { toActorId, quantity }
//   GET    /api/v1/actors/:actorId/items/equipped
//   GET    /api/v1/actors/:actorId/items/carry
//   DELETE /api/v1/actors/:actorId/items/:entityId              (drop)
// Sorting/filtering/view reuse src/frontend/inventory/inventory-grid.ts.
// No SSE for item lists exists in the codebase (hx-sse ext is loaded but no
// list subscribes to one), so the panel refreshes by re-fetching after
// mutations instead of holding a stream.
import {
  filterItems,
  type InventoryFilter,
  type InventoryItem,
  type InventorySortKey,
  type InventoryView,
  sortItems,
} from "../inventory/inventory-grid.js";
import { apiFetch, } from "./htmx.js";
import { t, } from "./i18n.js";
import { jsonBody, } from "./json.js";
import { log as rootLog, } from "./logger.js";

const log = rootLog.child({ module: "inventory", },);

/** Alpine scope for the inventory panel. */
export interface InventoryState {
  _invActorId: string | null;
  items: InventoryItem[];
  loading: boolean;
  loadError: string;
  view: InventoryView;
  sort: InventorySortKey;
  typeFilter: string;
  rarityFilter: string;
  equippedOnly: boolean;
  usableOnly: boolean;
  selectedId: string | null;
  busy: boolean;
  message: string;
  error: string;
  equipped: InventoryItem[];
  equippedLoading: boolean;
  equippedError: string;
  /** Point the panel at an actor; clears rows when the actor changes. */
  setActorId(actorId: string,): void;
  /** Rows after the active filter + sort. */
  visibleItems(): InventoryItem[];
  /** Active filter object derived from the scalar fields. */
  activeFilter(): InventoryFilter;
  /** Row currently shown in the details panel, if any. */
  selectedItem(): InventoryItem | null;
  /** Select a row by id (no-op when the id is unknown). */
  select(itemId: string,): void;
  /** Reload rows from the server. */
  load(): Promise<void>;
  /** Equip the row, then reload. */
  equip(itemId: string,): Promise<void>;
  /** Unequip the row, then reload. */
  unequip(itemId: string,): Promise<void>;
  /** Drop (DELETE) the row, then reload. */
  drop(itemId: string,): Promise<void>;
  /** Transfer `quantity` of the `itemId` row to `toActorId`, then reload. */
  transfer(transfer: { itemId: string; toActorId: string; quantity: number },): Promise<void>;
  /** Reload equipped rows from the server. */
  loadEquipped(): Promise<void>;
  /** Flip grid/list view. */
  toggleView(): void;
}

/** Decode the paginated list body; the generic entity shape is `{ data }`. */
function rowsFromBody(body: unknown,): InventoryItem[] {
  if (body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data,)) {
    return (body as { data: InventoryItem[] }).data;
  }

  return Array.isArray(body,) ? (body as InventoryItem[]) : [];
}

/**
 * Normalize the equipped endpoint body: raw `selectAll` rows (snake_case)
 * rather than the CRUD list's camelCase shape. Bare `{ data }` wrap and
 * camelCase pass-through stay accepted.
 * @param body Decoded response body.
 * @returns Equipped rows in `InventoryItem` shape.
 */
function normalizeEquipped(body: unknown,): InventoryItem[] {
  const rows = rowsFromBody(body,);
  return rows.map((row,) => {
    const record = row as unknown as Record<string, unknown>;
    const itemType = record["itemType"] ?? record["item_type"];
    const equipped = record["equipped"] ?? "equipped";
    return {
      ...row,
      itemType: typeof itemType === "string" ? itemType : "misc",
      equipped: typeof equipped === "string" || typeof equipped === "boolean" ? equipped : "equipped",
    } as InventoryItem;
  },);
}

/** POST/DELETE helper: false on transport error or non-2xx. */
async function mutate(url: string, init: RequestInit,): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await apiFetch(url, init,);
    if (res.ok) { return { ok: true, }; }
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, message: body.message, };
  } catch (error) {
    log.error("Inventory mutation failed", error instanceof Error ? error : undefined, { url, },);
    return { ok: false, };
  }
}

/** Build a state with defaults; no auto-load so tests skip the side effect. */
export const stateFromActor = (actorId: string | null = null,): InventoryState => ({
  _invActorId: actorId,
  items: [],
  loading: false,
  loadError: "",
  view: "grid",
  sort: "name",
  typeFilter: "",
  rarityFilter: "",
  equippedOnly: false,
  usableOnly: false,
  selectedId: null,
  busy: false,
  message: "",
  error: "",
  equipped: [],
  equippedLoading: false,
  equippedError: "",

  setActorId(actorId: string,) {
    if (this._invActorId === actorId) { return; }
    this._invActorId = actorId;
    this.items = [];
    this.selectedId = null;
    this.loadError = "";
    this.message = "";
    this.error = "";
    this.equipped = [];
    this.equippedError = "";
  },

  visibleItems() {
    return sortItems(filterItems(this.items, this.activeFilter(),), this.sort,);
  },

  activeFilter() {
    const filter: InventoryFilter = {};
    if (this.typeFilter.trim()) { filter.type = this.typeFilter.trim(); }
    if (this.rarityFilter.trim()) { filter.rarity = this.rarityFilter.trim(); }
    if (this.equippedOnly) { filter.equippedOnly = true; }
    if (this.usableOnly) { filter.usableOnly = true; }
    return filter;
  },

  selectedItem() {
    return this.items.find((item,) => item.id === this.selectedId) ?? null;
  },

  select(itemId: string,) {
    if (this.items.some((item,) => item.id === itemId)) { this.selectedId = itemId; }
  },

  async load() {
    const actorId = this._invActorId;
    if (!actorId) { return; }
    this.loading = true;
    this.loadError = "";
    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/items`,);
      if (!res.ok) {
        this.loadError = t("status.inventoryLoadFailed",);
        return;
      }

      this.items = rowsFromBody(await res.json(),);
      if (this.selectedId && !this.items.some((item,) => item.id === this.selectedId)) {
        this.selectedId = null;
      }
    } catch (error) {
      log.error("Failed to load inventory", error instanceof Error ? error : undefined, { actorId, },);
      this.loadError = t("status.inventoryLoadFailed",);
    } finally {
      this.loading = false;
    }
  },

  async equip(itemId: string,) {
    await runItemOp(this, "status.inventoryEquipFailed", `/api/v1/actors/${this._invActorId}/items/${itemId}/equip`, {
      method: "POST",
    },);
  },

  async unequip(itemId: string,) {
    await runItemOp(
      this,
      "status.inventoryUnequipFailed",
      `/api/v1/actors/${this._invActorId}/items/${itemId}/unequip`,
      { method: "POST", },
    );
  },

  async drop(itemId: string,) {
    await runItemOp(this, "status.inventoryDropFailed", `/api/v1/actors/${this._invActorId}/items/${itemId}`, {
      method: "DELETE",
    },);
  },

  async transfer({ itemId, toActorId, quantity, }: { itemId: string; toActorId: string; quantity: number },) {
    if (!Number.isInteger(quantity,) || quantity < 1) {
      this.error = t("status.inventoryTransferFailed",);

      return;
    }

    await runItemOp(
      this,
      "status.inventoryTransferFailed",
      `/api/v1/actors/${this._invActorId}/items/${itemId}/transfer`,
      { method: "POST", headers: { "Content-Type": "application/json", }, body: jsonBody({ toActorId, quantity, },), },
    );
  },

  async loadEquipped() {
    const actorId = this._invActorId;
    if (!actorId) { return; }
    this.equippedLoading = true;
    this.equippedError = "";
    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/items/equipped`,);
      if (!res.ok) {
        this.equippedError = t("status.inventoryEquippedFailed",);
        return;
      }

      this.equipped = normalizeEquipped(await res.json(),);
    } catch (error) {
      log.error("Failed to load equipped items", error instanceof Error ? error : undefined, { actorId, },);
      this.equippedError = t("status.inventoryEquippedFailed",);
    } finally {
      this.equippedLoading = false;
    }
  },

  toggleView() {
    this.view = this.view === "grid" ? "list" : "grid";
  },
});

/**
 * Run an equip/unequip/drop/transfer op: guard actor, mutate, reload on ok.
 * @param state Panel state (this).
 * @param failureKey i18n key for the error message.
 * @param url Operation endpoint.
 * @param init Fetch init for the mutation.
 * @returns {Promise<void>}
 */
async function runItemOp(state: InventoryState, failureKey: string, url: string, init: RequestInit,): Promise<void> {
  if (!state._invActorId) { return; }
  state.busy = true;
  state.error = "";
  state.message = "";
  const result = await mutate(url, init,);
  if (!result.ok) {
    state.error = result.message ?? t(failureKey,);
    state.busy = false;
    return;
  }

  state.busy = false;
  await state.load();
  await state.loadEquipped();
}

/**
 * Build the Alpine scope for one actor's inventory panel.
 * @param actorId Owning actor id.
 * @returns Panel state; caller triggers `load()`.
 */
export function inventoryFactory(actorId: string,): InventoryState {
  return stateFromActor(actorId,);
}

export const inventory = stateFromActor();

(globalThis as Record<string, unknown>).inventoryFactory = inventoryFactory;
(globalThis as Record<string, unknown>).inventory = inventory;
