// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── RPG Stats Types (Phase 1 Foundation) ─────────────────────
export interface RpgStatBlock {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface RpgStats extends RpgStatBlock {
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  ac: number;
  initiative: number;
  xp: number;
  xpToNext: number;
}

export interface StatusEffect {
  id: string;
  name: string;
  description: string;
  duration: number; // -1 = infinite, 0+ = turns remaining
  modifier: Partial<RpgStatBlock>;
  icon?: string;
}

export interface EquipmentSlot {
  slot: "head" | "chest" | "legs" | "feet" | "hands" | "weapon" | "shield" | "accessory";
  itemId: string | null;
  itemName?: string;
}
