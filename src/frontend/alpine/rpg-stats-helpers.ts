// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG stats helpers.
 *
 * Pure/data helpers for the rpgStats panel.
 */

import { apiFetch, } from "./htmx.js";
import { jsonParseOr, } from "./json.js";
import type { EquipmentSlot, StatusEffect, } from "./types.js";

/** Default stats when none exist in the backend */
export function defaultRpgStats() {
  return {
    level: 1,
    hp: 12,
    maxHp: 12,
    mp: 8,
    maxMp: 8,
    ac: 12,
    initiative: 0,
    xp: 0,
    xpToNext: 100,
    pendingAsi: 0,
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  };
}

/** Default equipment slots */
export function defaultEquipmentSlots(): EquipmentSlot[] {
  return [
    { slot: "head", itemId: null, },
    { slot: "chest", itemId: null, },
    { slot: "legs", itemId: null, },
    { slot: "feet", itemId: null, },
    { slot: "hands", itemId: null, },
    { slot: "weapon", itemId: null, },
    { slot: "shield", itemId: null, },
    { slot: "accessory", itemId: null, },
  ];
}

/**
 * Read the server error message from a non-ok progression response.
 * Falls back when the body is empty or unparseable.
 * @param res
 * @param fallback
 */
export async function readAsiError(res: Response, fallback: string,): Promise<string> {
  const text = await res.text().catch(() => "");
  const body = jsonParseOr(text, null,) as { error?: unknown } | null;
  return typeof body?.error === "string" && body.error ? body.error : fallback;
}

/**
 * Parse conditions + buff/debuff active effects into StatusEffect badges.
 * Active-effect stat_modifier entries attach so effectiveStat() picks them up.
 * @param conditionsRaw
 * @param effectsRaw
 */
export function parseStatusEffects(conditionsRaw: string, effectsRaw: string,): StatusEffect[] {
  const out: StatusEffect[] = [];
  const conditions = jsonParseOr(conditionsRaw, null,) as
    | Array<{
      name: string;
      source?: string;
      duration_rounds?: number;
    }>
    | null;

  if (Array.isArray(conditions,)) {
    for (const c of conditions) {
      if (!c || typeof c.name !== "string" || !c.name) { continue; }
      out.push({
        id: c.name.toLowerCase().replaceAll(/\s+/gu, "_",),
        name: c.name,
        description: c.source ? `Source: ${c.source}` : "",
        duration: c.duration_rounds ?? -1,
        modifier: {},
      },);
    }
  }

  const effects = jsonParseOr(effectsRaw, null,) as
    | Array<{
      name: string;
      type?: string;
      source?: string;
      duration_rounds?: number;
      stat_modifier?: Partial<Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>>;
    }>
    | null;

  if (Array.isArray(effects,)) {
    for (const e of effects) {
      if (!e || typeof e.name !== "string" || !e.name) { continue; }
      if (e.type !== "buff" && e.type !== "debuff") { continue; }
      const modifier: StatusEffect["modifier"] = {};
      if (e.stat_modifier && typeof e.stat_modifier === "object") {
        for (const key of ["str", "dex", "con", "int", "wis", "cha",] as const) {
          const value = e.stat_modifier[key];
          if (typeof value === "number" && Number.isFinite(value,)) { modifier[key] = value; }
        }
      }

      const label = e.type === "buff" ? `⬆ ${e.name}` : `⬇ ${e.name}`;
      out.push({
        id: `${e.type}_${e.name.toLowerCase().replaceAll(/\s+/gu, "_",)}`,
        name: label,
        description: e.source ? `Source: ${e.source}` : e.type,
        duration: e.duration_rounds ?? -1,
        modifier,
      },);
    }
  }

  return out;
}

/**
 * Load equipped actor-items into the fixed 8-slot display grid.
 * Best-effort: transport errors, non-ok, and malformed rows keep defaults.
 * @param actorId
 */
export async function loadEquipmentSlots(actorId: string,): Promise<EquipmentSlot[]> {
  try {
    const res = await apiFetch(`/api/v1/actors/${encodeURIComponent(actorId,)}/items/equipped`,);
    if (!res.ok) { return defaultEquipmentSlots(); }
    // res.json() rejects on non-JSON 200 bodies; the .catch folds that
    // into the same keep-defaults path as malformed rows.
    const body = await res.json().catch(() => null) as
      | Array<{ id?: unknown; name?: unknown; item_type?: unknown }>
      | { data?: Array<{ id?: unknown; name?: unknown; item_type?: unknown }> }
      | null;

    const rows = Array.isArray(body,) ? body : Array.isArray(body?.data,) ? body.data : null;
    if (!rows) { return defaultEquipmentSlots(); }
    const slots = defaultEquipmentSlots();
    for (const row of rows) {
      if (!row || typeof row !== "object") { continue; }
      if (typeof row.id !== "string" || !row.id) { continue; }
      const target = slotForEquippedType(typeof row.item_type === "string" ? row.item_type : "",);
      if (!target) { continue; }
      const slot = slots.find((s,) => s.slot === target);
      if (!slot || slot.itemId !== null) { continue; }
      slot.itemId = row.id;
      if (typeof row.name === "string" && row.name) { slot.itemName = row.name; }
    }

    return slots;
  } catch {
    return defaultEquipmentSlots();
  }
}

/**
 * Map an actor-item item_type to a display slot. Backend source of truth
 * is src/services/actor-items/equip.ts slotForCategory: weapon ->
 * weapon, armor -> armor, everything else -> accessory.
 *
 * Display-only drift (deliberate, documented here): the 8-slot grid
 * predates the 3-slot backend (TASK-equipment-slots follow-up owns
 * reconciling them). armor renders in the chest row; unknown
 * backend-future types (shield/helmet/boots/gloves/legs) map to their
 * named rows when present and fall through to null otherwise.
 * Frontend bundle never imports backend services, so this stays local.
 * @param itemType
 */
export function slotForEquippedType(itemType: string,): EquipmentSlot["slot"] | null {
  switch (itemType) {
    case "weapon": {
      return "weapon";
    }

    case "armor": {
      return "chest";
    }

    case "shield": {
      return "shield";
    }

    case "helmet": {
      return "head";
    }

    case "boots": {
      return "feet";
    }

    case "gloves": {
      return "hands";
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
    case "other":
    case "accessory": {
      return "accessory";
    }

    case "legs": {
      return "legs";
    }

    default: {
      return null;
    }
  }
}
