// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG Stats Panel Component
 *
 * Loads real stats from `/api/v1/rpg/stats/:actorId`.
 * Falls back to defaults if no stats exist yet.
 */

import { apiFetch, } from "./htmx.js";
import { jsonBody, } from "./json.js";
import {
  defaultEquipmentSlots,
  defaultRpgStats,
  loadEquipmentSlots,
  parseStatusEffects,
  readAsiError,
} from "./rpg-stats-helpers.js";
import type { ChatState, StatusEffect, } from "./types.js";

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
