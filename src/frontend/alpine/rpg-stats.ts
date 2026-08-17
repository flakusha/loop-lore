// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG Stats Panel Component
 *
 * Loads real stats from `/api/rpg/stats/:actorId`.
 * Falls back to defaults if no stats exist yet.
 */

import { apiFetch, } from "./htmx.js";
import type { ChatState, EquipmentSlot, StatusEffect, } from "./types.js";

export const rpgStats: Partial<ChatState> & ThisType<ChatState> = {
  rpgStats: null,
  statusEffects: [],
  equipment: [],

  async loadRpgStats() {
    const activeChat = this.activeChat;
    if (!activeChat) {
      this.rpgStats = null;
      return;
    }

    try {
      // First get the character_id from the chat
      const chatRes = await apiFetch(`/api/v1/chats/${activeChat}`,);
      if (!chatRes.ok) {
        this.rpgStats = null;
        return;
      }
      const chat = await chatRes.json();
      const actorId = chat.character_id;
      if (!actorId) {
        this.rpgStats = null;
        return;
      }

      // Fetch RPG stats for this actor
      const statsRes = await apiFetch(`/api/rpg/stats/${actorId}`,);
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
          str: data.str ?? 10,
          dex: data.dex ?? 10,
          con: data.con ?? 10,
          int: data.int ?? 10,
          wis: data.wis ?? 10,
          cha: data.cha ?? 10,
        };

        // Parse conditions and effects from JSON strings
        this.statusEffects = parseConditions(data.conditions,);
        this.equipment = parseEquipmentSlots(data.activeEffects,);
      } else if (statsRes.status === 404) {
        // No stats exist yet — use defaults
        this.rpgStats = defaultRpgStats();
        this.statusEffects = [];
        this.equipment = defaultEquipmentSlots();
      } else {
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
   * Calculate D&D-style modifier: floor((stat - 10) / 2)
   */
  getModifier(stat: number,): number {
    return Math.floor((stat - 10) / 2,);
  },

  /**
   * Calculate effective stat with status effect modifiers.
   * Note: Equipment bonuses applied at use time, not stored.
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

/** Parse conditions JSON string into StatusEffect array */
function parseConditions(raw: string,): StatusEffect[] {
  if (!raw || raw === "[]") { return []; }
  try {
    const parsed = JSON.parse(raw,) as Array<{ name: string; source?: string; duration_rounds?: number }>;
    return parsed.map((c,) => ({
      id: c.name.toLowerCase().replace(/\s+/gu, "_",),
      name: c.name,
      description: c.source ? `Source: ${c.source}` : "",
      duration: c.duration_rounds ?? -1,
      modifier: {},
    }));
  } catch {
    return [];
  }
}

/** Parse active effects JSON string into EquipmentSlot[] placeholder */
function parseEquipmentSlots(raw: string,): EquipmentSlot[] {
  if (!raw || raw === "[]") { return defaultEquipmentSlots(); }
  try {
    const parsed = JSON.parse(raw,) as Array<{ name: string; type: string }>;
    // Map effects to equipment-like display
    const slots = defaultEquipmentSlots();
    for (const effect of parsed) {
      if (effect.type === "buff" || effect.type === "debuff") {
        // Effects don't map to equipment slots — they're shown as status effects
        // This is a placeholder for future equipment integration
      }
    }
    return slots;
  } catch {
    return defaultEquipmentSlots();
  }
}
