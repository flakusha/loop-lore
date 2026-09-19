// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { EncounterOutcome, EncounterPhase, } from "./types";

/**
 * Default encounter phases.
 */
export function buildDefaultPhases(): EncounterPhase[] {
  return [
    {
      name: "Foreplay",
      duration: 3,
      actionsAvailable: ["kissing", "touching", "teasing",],
      arousalEffects: [{ target: "partner", amount: 15, },],
      narrativeBeats: ["Building tension...",],
    },
    {
      name: "Main",
      duration: 5,
      actionsAvailable: ["all",],
      arousalEffects: [{ target: "all", amount: 25, },],
      narrativeBeats: ["The encounter intensifies...",],
    },
    {
      name: "Aftercare",
      duration: 2,
      actionsAvailable: ["cuddling", "talking", "resting",],
      arousalEffects: [{ target: "all", amount: -10, },],
      narrativeBeats: ["A moment of calm...",],
    },
  ];
}

/**
 * Default encounter outcomes.
 */
export function buildDefaultOutcomes(): EncounterOutcome[] {
  return [
    {
      type: "satisfaction",
      probability: 0.7,
      effects: {
        intimacyChange: 5,
        moodChange: 10,
        satisfactionBonus: 15,
        memoryCreated: true,
        reputationChange: 0,
      },
    },
    {
      type: "dissatisfaction",
      probability: 0.2,
      effects: {
        intimacyChange: -2,
        moodChange: -5,
        satisfactionBonus: 0,
        memoryCreated: true,
        reputationChange: 0,
      },
    },
    {
      type: "bonding",
      probability: 0.1,
      effects: {
        intimacyChange: 10,
        moodChange: 15,
        satisfactionBonus: 20,
        memoryCreated: true,
        reputationChange: 0,
      },
    },
  ];
}
