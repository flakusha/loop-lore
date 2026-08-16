// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World Items mixin — item creation + item settings for a world's edit page.
 *
 * Mirrors the `worldLocations` mixin. Item definitions CRUD against
 * /api/worlds/:worldId/items (world-level, owner/admin gated server-side).
 */
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { WorldEditState, } from "./world-types";

const log = rootLog.child({ module: "world-items", },);

export const worldItems: Partial<WorldEditState> & ThisType<WorldEditState> = {
  items: [],
  itemsLoaded: false,
  loadingItems: false,
  showAddForm: false,
  newItemName: "",
  newItemDesc: "",
  newItemCategory: "other",
  newItemRarity: "common",
  newItemValue: "0",
  newItemWeight: "0",
  expandedItem: "",
  editItemName: "",
  editItemDesc: "",
  editItemCategory: "other",
  editItemRarity: "common",
  editItemValue: "0",
  editItemWeight: "0",
  instances: [],
  instancesLoaded: false,
  loadingInstances: false,
  placeLocationId: "",
  placeQuantity: "1",

  locName(locId: string | null,): string {
    if (!locId) { return "—"; }
    const loc = this.locations.find((l,) => l.id === locId);
    return loc ? loc.name : "(unknown)";
  },

  async loadItems() {
    this.loadingItems = true;
    this.itemsLoaded = false;
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/items`, {
        headers: { Accept: "application/json", },
      },);
      if (res.ok) {
        const data = await res.json();
        this.items = Array.from(data.data || [], (it: Record<string, unknown>,) => ({
          id: it.id as string,
          name: it.name as string,
          description: (it.description as string | null) ?? null,
          category: (it.category as string) ?? "other",
          rarity: (it.rarity as string) ?? "common",
          value: Number(it.value,) || 0,
          weight: Number(it.weight,) || 0,
          stackable: Boolean(it.stackable,),
          max_stack: Number(it.max_stack,) || 1,
          properties: (it.properties as Record<string, unknown> | null) ?? null,
        }),);
        this.itemsLoaded = true;
      }
    } catch (error) {
      log.warn("loadItems failed", { error: String(error,), },);
    }
    this.loadingItems = false;
  },

  async addItem() {
    if (!this.newItemName.trim()) { return; }
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          name: this.newItemName.trim(),
          description: this.newItemDesc.trim(),
          category: this.newItemCategory,
          rarity: this.newItemRarity,
          value: Number(this.newItemValue,) || 0,
          weight: Number(this.newItemWeight,) || 0,
        },),
      },);
      if (res.ok) {
        this.newItemName = "";
        this.newItemDesc = "";
        this.newItemCategory = "other";
        this.newItemRarity = "common";
        this.newItemValue = "0";
        this.newItemWeight = "0";
        showToast("success", t("toasts.itemCreated",),);
        await this.loadItems();
      } else {
        const err = await res.json();
        showToast("error", err.error || err.message || t("toasts.failedCreateItem",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },

  expandItem(itemId: string,) {
    if (this.expandedItem === itemId) {
      this.expandedItem = "";
      return;
    }
    this.expandedItem = itemId;
    const item = this.items.find((it,) => it.id === itemId);
    if (item) {
      this.editItemName = item.name;
      this.editItemDesc = item.description || "";
      this.editItemCategory = item.category;
      this.editItemRarity = item.rarity;
      this.editItemValue = String(item.value,);
      this.editItemWeight = String(item.weight,);
    }
  },

  async saveItem(itemId: string,) {
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          name: this.editItemName.trim(),
          description: this.editItemDesc.trim(),
          category: this.editItemCategory,
          rarity: this.editItemRarity,
          value: Number(this.editItemValue,) || 0,
          weight: Number(this.editItemWeight,) || 0,
        },),
      },);
      if (res.ok) {
        await this.loadItems();
        this.expandedItem = "";
        showToast("success", t("toasts.itemUpdated",),);
      } else {
        const err = await res.json();
        showToast("error", err.message || err.error || t("toasts.failedUpdateItem",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },

  async deleteItem(itemId: string,) {
    if (!confirm(t("worlds.deleteItemConfirm",),)) {
      return;
    }
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/items/${itemId}`, { method: "DELETE", },);
      if (res.ok) { await this.loadItems(); }
      else {
        showToast("error", t("toasts.failedDeleteItem",),);
      }
    } catch {
      showToast("error", t("toasts.failedDeleteItem",),);
    }
  },

  async loadInstances(itemId: string,) {
    this.loadingInstances = true;
    this.instancesLoaded = false;
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/items/${itemId}/instances`, {
        headers: { Accept: "application/json", },
      },);
      if (res.ok) {
        const raw: unknown = await res.json();
        let rows: unknown[] = [];
        if (Array.isArray(raw,)) {
          rows = raw;
        } else if (raw && typeof raw === "object" && "data" in raw) {
          const data = (raw as Record<string, unknown>).data;
          rows = Array.isArray(data,) ? data : [];
        }
        this.instances = Array.from(rows, (inst: unknown,) => {
          const rec = (inst && typeof inst === "object" ? inst : {}) as Record<string, unknown>;
          return {
            id: rec.id as string,
            item_id: (rec.item_id as string) ?? itemId,
            location_id: (rec.location_id as string | null) ?? null,
            owner_actor_id: (rec.owner_actor_id as string | null) ?? null,
            quantity: Number(rec.quantity,) || 1,
            visibility: (rec.visibility as string) ?? "visible",
            created_at: (rec.created_at as string) ?? "",
          };
        },);
        this.instancesLoaded = true;
      }
    } catch (error) {
      log.warn("loadInstances failed", { error: String(error,), },);
    }
    this.loadingInstances = false;
  },

  async placeInstance(itemId: string,) {
    const body: Record<string, unknown> = {
      itemId,
      quantity: Number(this.placeQuantity,) || 1,
    };
    if (this.placeLocationId) { body.locationId = this.placeLocationId; }
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/item-instances`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(body,),
      },);
      if (res.ok) {
        this.placeQuantity = "1";
        this.placeLocationId = "";
        showToast("success", t("toasts.itemPlaced",),);
        await this.loadInstances(itemId,);
      } else {
        const err = await res.json();
        showToast("error", err.error || err.message || t("toasts.failedPlaceItem",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },

  async destroyInstance(instanceId: string,) {
    if (!confirm(t("worlds.destroyInstanceConfirm",),)) { return; }
    try {
      const res = await apiFetch(`/api/worlds/${this.worldId}/item-instances/${instanceId}`, {
        method: "DELETE",
      },);
      if (res.ok) { await this.loadInstances(this.expandedItem,); }
      else {
        showToast("error", t("toasts.failedDestroyInstance",),);
      }
    } catch {
      showToast("error", t("toasts.failedDestroyInstance",),);
    }
  },
};
