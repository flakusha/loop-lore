// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/index.ts — Autonomy module barrel
//
// Phase 1: config layer (resolver + presets).
// Phase 2: rate governor.
// Phase 4: world-tick scheduler.

export { AutonomyGovernor, LIMIT_CATALOG, } from "./governor";
export type {
  AutonomyScope,
  BudgetRow,
  GovernorLimit,
  GovernorLimitCatalog,
  GovernorLimitName,
  GovernorResult,
  TryConsumeOptions,
} from "./governor";
export { AutonomyScheduler, SimulationStore, } from "./scheduler";
export type { AutonomySchedulerOptions, } from "./scheduler";
export type {
  SimulationState,
  TickResult,
  TickSkipReason,
  WorldScheduleEntry,
  WorldTickOutcome,
  WorldTickResult,
} from "./scheduler";

export { getPreset, PRESETS, SHIPPED_PRESETS, UnboundedStressGatedError, } from "./config";
export { resolveAutonomyConfig, } from "./config";
export type {
  AutonomyConfig,
  AutonomyConfigOverride,
  PacingPresetName,
  PresetDefinition,
  ResolveAutonomyScope,
} from "./config";
