// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Card Battle Engine
 *
 * Deck management, card comparison logic, damage calculation,
 * battle state machine, and action modifier resolution.
 */

export { createDeck, shuffleDeck, initDeckState, drawCards, discardCards } from "./deck";
export { compareCards, calculateDamage } from "./combat";
export { initBattle, playBattleCard, cardToString } from "./battle";