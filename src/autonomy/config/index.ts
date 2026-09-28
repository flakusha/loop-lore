// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/config/index.ts — Autonomy config surface barrel
//
// Pure module: no scheduler/governor/tick-driver deps. Both the
// scheduler (cron) and the autonomy governor (separate tickets)
// consume the resolver at runtime.

export { EMPTY_AUTONOMY_OVERRIDE, getPreset, PRESETS, SHIPPED_PRESETS, UnboundedStressGatedError, } from "./presets";
export { resolveAutonomyConfig, resolveAutonomyLayers, } from "./resolver";
export type {
  AutonomyConfig,
  AutonomyConfigOverride,
  AutonomyLayers,
  PacingPresetName,
  PresetDefinition,
  ResolveAutonomyScope,
} from "./types";
