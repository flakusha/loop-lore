// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { EquipmentSlot, RpgStats, StatusEffect, } from "./rpg";

// ── RPG Stats ───────────────────────────────────────────────
export interface ChatRpgState {
  rpgStats: RpgStats | null;
  statusEffects: StatusEffect[];
  equipment: EquipmentSlot[];
  loadRpgStats(): Promise<void>;
  getModifier(stat: number,): number;
  effectiveStat(base: number, effects: StatusEffect[],): number;
}
