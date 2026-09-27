// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/config/index.ts — Autonomy config surface barrel
//
// Pure module: no scheduler/governor/tick-driver deps. Both the
// scheduler (cron) and the autonomy governor (separate tickets)
// consume the resolver at runtime.

export { getPreset, PRESETS, SHIPPED_PRESETS, UnboundedStressGatedError, } from "./presets";
export { resolveAutonomyConfig, } from "./resolver";
export type {
  AutonomyConfig,
  AutonomyConfigOverride,
  PacingPresetName,
  PresetDefinition,
  ResolveAutonomyScope,
} from "./types";