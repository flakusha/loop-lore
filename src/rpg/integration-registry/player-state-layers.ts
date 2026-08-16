// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration Registry — player state layers data
 *
 * The compile-time population list of `PlayerStateLayer` records seeding the
 * registry via `integration.registerStateLayer(...)`. These wire into
 * player-state-machine.md.
 */
import type { PlayerStateLayer, } from "./types";

/** Player state layers, grouped by owner system. */
export const PLAYER_STATE_LAYERS: PlayerStateLayer[] = [
  {
    id: "vitality",
    classification: "exclusive",
    owner: "rpg_mechanics",
    producers: ["battle", "disease", "magic",],
    consumers: [
      "battle",
      "social",
      "crime",
      "companion",
      "housing",
      "exploration",
      "disease",
      "nsfw",
      "magic",
    ],
    typeName: "VitalityState",
  },
  {
    id: "consciousness",
    classification: "exclusive",
    owner: "resolution",
    producers: ["battle", "disease", "magic",],
    consumers: ["battle", "social", "nsfw", "exploration", "crime",],
    typeName: "ConsciousnessState",
  },
  {
    id: "combat",
    classification: "exclusive",
    owner: "battle",
    producers: ["battle", "disease", "magic",],
    consumers: ["battle", "companion", "crime", "social",],
    typeName: "CombatState",
  },
  {
    id: "social",
    classification: "stackable",
    owner: "social",
    producers: ["social", "crime", "faction",],
    consumers: [
      "social",
      "crime",
      "faction",
      "economy",
      "housing",
      "companion",
    ],
    typeName: "SocialState",
  },
  {
    id: "mental",
    classification: "exclusive",
    owner: "character_core",
    producers: ["magic", "social", "nsfw", "disease",],
    consumers: ["battle", "social", "crime", "companion", "exploration",],
    typeName: "MentalState",
  },
  {
    id: "physical",
    classification: "stackable",
    owner: "disease",
    producers: ["disease", "magic", "crafting", "crime", "weather",],
    consumers: ["battle", "exploration", "nsfw", "social",],
    typeName: "PhysicalState",
  },
  {
    id: "environmental",
    classification: "stackable",
    owner: "weather",
    producers: ["weather", "exploration",],
    consumers: [
      "battle",
      "disease",
      "nsfw",
      "crafting",
      "housing",
      "exploration",
    ],
    typeName: "EnvironmentalState",
  },
  {
    id: "nsfw_intimate",
    classification: "exclusive",
    owner: "nsfw",
    producers: ["nsfw", "social", "weather",],
    consumers: ["nsfw", "social", "disease", "character_core", "housing",],
    typeName: "NsfwState",
  },
];
