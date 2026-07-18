/**
 * RPG Stats Panel Component
 *
 * Phase 1 Foundation: Stats display, status effects, equipment slots.
 * No backend wiring — uses mock data for UI development.
 */

import type { ChatState, StatusEffect, EquipmentSlot } from "./types";

export const rpgStats: Partial<ChatState> & ThisType<ChatState> = {
  rpgStats: null,
  statusEffects: [],
  equipment: [],

  async loadRpgStats() {
    // Phase 1: Mock data for UI development
    // TODO: Replace with actual API call when backend is ready
    this.rpgStats = {
      level: 1,
      hp: 12,
      maxHp: 12,
      mp: 8,
      maxMp: 8,
      ac: 12,
      initiative: 2,
      xp: 0,
      xpToNext: 100,
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    };

    this.statusEffects = [] as StatusEffect[];

    this.equipment = [
      { slot: "head", itemId: null },
      { slot: "chest", itemId: null },
      { slot: "legs", itemId: null },
      { slot: "feet", itemId: null },
      { slot: "hands", itemId: null },
      { slot: "weapon", itemId: null },
      { slot: "shield", itemId: null },
      { slot: "accessory", itemId: null },
    ] as EquipmentSlot[];
  },

  /**
   * Calculate D&D-style modifier: floor((stat - 10) / 2)
   */
  getModifier(stat: number): number {
    return Math.floor((stat - 10) / 2);
  },

  /**
   * Calculate effective stat with status effect modifiers.
   * Note: Equipment bonuses applied at use time, not stored.
   */
  effectiveStat(base: number, effects: StatusEffect[]): number {
    let total = base;
    for (const effect of effects) {
      for (const mod of Object.values(effect.modifier)) {
        total += mod;
      }
    }
    return total;
  },
};
