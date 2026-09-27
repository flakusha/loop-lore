// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/ aggregate barrel.
 *
 * Re-exports every public surface under src/rpg/ so callers can do
 * `import { IntimacyService, SeductionService, ... } from "../rpg"`.
 * Each per-module barrel (combat.ts, seduction.ts, intimacy.ts, ...)
 * is the curated single-entry point for its subsystem; this file
 * is the root-level aggregate for callers that touch multiple RPG
 * subsystems.
 *
 * Modules intentionally included:
 *   - Barrels that re-export from a co-located dir (combat, dice, loot, xp,
 *     body, seduction, encounters, fantasies, intimacy, nsfw-skills, mood,
 *     quests, stats)
 *   - Canonical flat files (chemistry, reproduction, reputation,
 *     status-effects, trauma) - these define their classes inline.
 */
export * from "./body";
export * from "./chemistry";
export * from "./combat";
export * from "./dice";
export * from "./encounters";
export * from "./fantasies";
export * from "./intimacy";
export * from "./loot";
export * from "./mood";
export * from "./nsfw-skills";
export * from "./quests";
export * from "./reproduction";
export * from "./reputation";
export * from "./seduction";
export * from "./stats";
export * from "./status-effects";
export * from "./trauma";
export * from "./xp";
