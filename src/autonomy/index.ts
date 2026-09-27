// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/index.ts — Autonomy module barrel
//
// Phase 1: config layer (resolver + presets).
// Phase 2: rate governor.

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

export { getPreset, PRESETS, SHIPPED_PRESETS, UnboundedStressGatedError, } from "./config";
export { resolveAutonomyConfig, } from "./config";
export type {
  AutonomyConfig,
  AutonomyConfigOverride,
  PacingPresetName,
  PresetDefinition,
  ResolveAutonomyScope,
} from "./config";
