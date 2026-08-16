// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration Registry — battle integration edges
 *
 * Cross-system edges where Battle is the source system. Migrated verbatim from
 * the former `buildEdges()`.
 */
import { EdgeDirection, EventDirection, type IntegrationEdge, } from "../types";

/** Integration edges rooted at the Battle system. */
export const BATTLE_EDGES: IntegrationEdge[] = [
  {
    source: "battle",
    target: "items",
    direction: EdgeDirection.DependsOn,
    interfaces: ["Item", "StatusEffect",],
    events: [
      {
        id: "battle.loot_dropped",
        direction: EventDirection.Emits,
        source: "battle",
        target: "items",
        notes: "Loot drops feed inventory",
      },
      {
        id: "battle.item_used",
        direction: EventDirection.Emits,
        source: "battle",
        target: "items",
        notes: "Consumable consumed in combat",
      },
    ],
  },
  {
    source: "battle",
    target: "social",
    direction: EdgeDirection.DependsOn,
    interfaces: ["CharacterStats", "StatusEffect",],
    events: [
      {
        id: "battle.intimidate_check",
        direction: EventDirection.Subscribes,
        source: "social",
        target: "battle",
        notes: "Social skill during combat",
      },
      {
        id: "battle.surrender",
        direction: EventDirection.Emits,
        source: "battle",
        target: "social",
        notes: "Surrender resolves combat via social",
      },
    ],
  },
  {
    source: "battle",
    target: "weather",
    direction: EdgeDirection.DependsOn,
    interfaces: ["PlayerState",],
    events: [
      {
        id: "weather.changed",
        direction: EventDirection.Subscribes,
        source: "weather",
        target: "battle",
        notes: "Environmental modifiers applied",
      },
    ],
  },
  {
    source: "battle",
    target: "companion",
    direction: EdgeDirection.DependedBy,
    interfaces: ["PlayerState", "CharacterStats",],
    events: [
      {
        id: "battle.companion_turn",
        direction: EventDirection.Subscribes,
        source: "companion",
        target: "battle",
        notes: "Companion participates in turn order",
      },
      {
        id: "companion.fainted",
        direction: EventDirection.Emits,
        source: "companion",
        target: "battle",
        notes: "Companion removed from combat",
      },
    ],
  },
  {
    source: "battle",
    target: "resolution",
    direction: EdgeDirection.DependsOn,
    interfaces: ["DiceRoll",],
    events: [
      {
        id: "resolution.roll",
        direction: EventDirection.Subscribes,
        source: "resolution",
        target: "battle",
        notes: "Attack rolls, saving throws",
      },
    ],
  },
];
