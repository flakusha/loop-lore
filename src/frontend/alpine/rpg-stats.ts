// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG Stats Panel Component
 *
 * Loads real stats from `/api/v1/rpg/stats/:actorId`.
 * Falls back to defaults if no stats exist yet.
 */

import { apiFetch, } from "./htmx.js";
import { jsonBody, jsonParseOr, } from "./json.js";
import type { ChatState, EquipmentSlot, StatusEffect, } from "./types.js";

export const rpgStats: Partial<ChatState> & ThisType<ChatState> = {
  rpgStats: null,
  statusEffects: [],
  equipment: [],
  _rpgActorId: null as string | null,
  rpgAsiBusy: false as boolean,
  rpgAsiError: null as string | null,

  /**
   * @returns {Promise<void>}
   */
  async loadRpgStats() {
    const activeChat = this.activeChat;
    if (!activeChat) {
      this.rpgStats = null;
      this.statusEffects = [];
      this.equipment = defaultEquipmentSlots();
      return;
    }

    try {
      // First get the character_id from the chat
      const chatRes = await apiFetch(`/api/v1/chats/${encodeURIComponent(activeChat,)}`,);
      if (!chatRes.ok) {
        this.rpgStats = null;
        this.statusEffects = [];
        this.equipment = defaultEquipmentSlots();
        return;
      }

      const chat = await chatRes.json();
      const actorId = chat.character_id;
      if (!actorId) {
        this.rpgStats = null;
        this.statusEffects = [];
        this.equipment = defaultEquipmentSlots();
        return;
      }

      // Fetch RPG stats for this actor
      const statsRes = await apiFetch(`/api/v1/rpg/stats/${encodeURIComponent(actorId,)}`,);
      this._rpgActorId = actorId;
      if (statsRes.ok) {
        const data = await statsRes.json();
        this.rpgStats = {
          level: data.level ?? 1,
          hp: data.hp ?? 0,
          maxHp: data.maxHp ?? 0,
          mp: data.mp ?? 0,
          maxMp: data.maxMp ?? 0,
          ac: data.ac ?? 10,
          initiative: data.speed ? Math.floor((data.speed - 10) / 2,) : 0,
          xp: data.xp ?? 0,
          xpToNext: data.xpToNext ?? 100,
          pendingAsi: data.pendingAsi ?? 0,
          str: data.str ?? 10,
          dex: data.dex ?? 10,
          con: data.con ?? 10,
          int: data.int ?? 10,
          wis: data.wis ?? 10,
          cha: data.cha ?? 10,
        };

        // Conditions + buff/debuff active effects merge into status badges.
        this.statusEffects = parseStatusEffects(data.conditions, data.activeEffects,);
        // Best-effort equipment overlay: equipped actor-items fill the
        // fixed slot grid by item_type; failures keep the empty grid.
        this.equipment = await loadEquipmentSlots(actorId,);
      } else {
        // No stats / non-200 — use defaults
        this.rpgStats = defaultRpgStats();
        this.statusEffects = [];
        this.equipment = defaultEquipmentSlots();
      }
    } catch {
      this.rpgStats = defaultRpgStats();
      this.statusEffects = [];
      this.equipment = defaultEquipmentSlots();
    }
  },

  /**
   * Spend 2 pending ASI points on one ability via
   * POST /api/v1/rpg/progression/:actorId/asi ({ability, points:2}),
   * then reload stats. Failures surface on rpgAsiError.
   * @param ability
   */
  async allocateAsi(ability: string,) {
    const actorId = this._rpgActorId;
    if (!actorId || this.rpgAsiBusy) { return; }
    this.rpgAsiBusy = true;
    this.rpgAsiError = null;
    try {
      const res = await apiFetch(`/api/v1/rpg/progression/${encodeURIComponent(actorId,)}/asi`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ ability, points: 2, },),
      },);

      if (!res.ok) {
        this.rpgAsiError = await readAsiError(res, "Failed to allocate ability points",);
        return;
      }

      await this.loadRpgStats();
    } catch {
      this.rpgAsiError = "Failed to allocate ability points";
    } finally {
      this.rpgAsiBusy = false;
    }
  },

  /**
   * Auto-resolve the pending budget via POST
   * /api/v1/rpg/progression/:actorId/level-up ({kind:"auto"}),
   * then reload stats. Failures surface on rpgAsiError.
   */
  async resolveLevelUpAuto() {
    const actorId = this._rpgActorId;
    if (!actorId || this.rpgAsiBusy) { return; }
    this.rpgAsiBusy = true;
    this.rpgAsiError = null;
    try {
      const res = await apiFetch(`/api/v1/rpg/progression/${encodeURIComponent(actorId,)}/level-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ kind: "auto", },),
      },);

      if (!res.ok) {
        this.rpgAsiError = await readAsiError(res, "Failed to resolve level-up",);
        return;
      }

      await this.loadRpgStats();
    } catch {
      this.rpgAsiError = "Failed to resolve level-up";
    } finally {
      this.rpgAsiBusy = false;
    }
  },

  /**
   * Calculate D&D-style modifier: floor((stat - 10) / 2)
   * @param stat
   */
  getModifier(stat: number,): number {
    return Math.floor((stat - 10) / 2,);
  },

  /**
   * Calculate effective stat with status effect modifiers.
   * Note: Equipment bonuses applied at use time, not stored.
   * @param base
   * @param effects
   */
  effectiveStat(base: number, effects: StatusEffect[],): number {
    let total = base;
    for (const effect of effects) {
      for (const mod of Object.values(effect.modifier,)) {
        total += mod;
      }
    }

    return total;
  },
};

/** Default stats when none exist in the backend */
function defaultRpgStats() {
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
function defaultEquipmentSlots(): EquipmentSlot[] {
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
async function readAsiError(res: Response, fallback: string,): Promise<string> {
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
function parseStatusEffects(conditionsRaw: string, effectsRaw: string,): StatusEffect[] {
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
async function loadEquipmentSlots(actorId: string,): Promise<EquipmentSlot[]> {
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
function slotForEquippedType(itemType: string,): EquipmentSlot["slot"] | null {
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
