/**
 * Integration Registry — battle integration edges
 *
 * Cross-system edges where Battle is the source system. Migrated verbatim from
 * the former `buildEdges()`.
 */
import type { IntegrationEdge, } from "../types";

/** Integration edges rooted at the Battle system. */
export const BATTLE_EDGES: IntegrationEdge[] = [
  {
    source: "battle",
    target: "items",
    direction: "depends_on",
    interfaces: ["Item", "StatusEffect",],
    events: [
      {
        id: "battle.loot_dropped",
        direction: "emits",
        source: "battle",
        target: "items",
        notes: "Loot drops feed inventory",
      },
      {
        id: "battle.item_used",
        direction: "emits",
        source: "battle",
        target: "items",
        notes: "Consumable consumed in combat",
      },
    ],
  },
  {
    source: "battle",
    target: "social",
    direction: "depends_on",
    interfaces: ["CharacterStats", "StatusEffect",],
    events: [
      {
        id: "battle.intimidate_check",
        direction: "subscribes",
        source: "social",
        target: "battle",
        notes: "Social skill during combat",
      },
      {
        id: "battle.surrender",
        direction: "emits",
        source: "battle",
        target: "social",
        notes: "Surrender resolves combat via social",
      },
    ],
  },
  {
    source: "battle",
    target: "weather",
    direction: "depends_on",
    interfaces: ["PlayerState",],
    events: [
      {
        id: "weather.changed",
        direction: "subscribes",
        source: "weather",
        target: "battle",
        notes: "Environmental modifiers applied",
      },
    ],
  },
  {
    source: "battle",
    target: "companion",
    direction: "depended_by",
    interfaces: ["PlayerState", "CharacterStats",],
    events: [
      {
        id: "battle.companion_turn",
        direction: "subscribes",
        source: "companion",
        target: "battle",
        notes: "Companion participates in turn order",
      },
      {
        id: "companion.fainted",
        direction: "emits",
        source: "companion",
        target: "battle",
        notes: "Companion removed from combat",
      },
    ],
  },
  {
    source: "battle",
    target: "resolution",
    direction: "depends_on",
    interfaces: ["DiceRoll",],
    events: [
      {
        id: "resolution.roll",
        direction: "subscribes",
        source: "resolution",
        target: "battle",
        notes: "Attack rolls, saving throws",
      },
    ],
  },
];
