// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/config/types.ts — Autonomy pacing config types
//
// Pacing presets govern how often an autonomous actor ticks (proposes
// actions / emits ambient beats). Layered resolution is owned by
// `./resolver.ts`; this file is pure shapes.

/** Built-in pacing preset names. Extend with custom presets in code, not config. */
export type PacingPresetName =
  | "serene"
  | "organic"
  | "brisk"
  | "unlimited-stress";

/** Static preset definition — values that DON'T vary by layer. */
export interface PresetDefinition {
  /** Cadence between ticks (ms). Lower = more frequent. */
  tickIntervalMs: number;
  /** Random jitter applied to tick interval, as ratio of tickIntervalMs (0–1). */
  jitterRatio: number;
  /** Hard cap on autonomous ticks per actor per rolling chat session. null = unbounded. */
  perAgentCap: number | null;
  /** Hard cap on autonomous ticks per user-driven chat per rolling chat session. */
  perUserCap: number | null;
}

/** Layered autonomy config, fully resolved. */
export interface AutonomyConfig {
  /** Preset name resolved at this layer (informational; values come from preset). */
  preset: PacingPresetName;
  /** Master switch — false skips ticking entirely regardless of preset. */
  enabled: boolean;
  /** Cadence between ticks (ms). */
  tickIntervalMs: number;
  /** Random jitter ratio (0–1). */
  jitterRatio: number;
  /** Per-agent tick cap. null = unbounded (only legal with `unlimited-stress` outside prod). */
  perAgentCap: number | null;
  /** Per-user tick cap (per chat session). null = unbounded. */
  perUserCap: number | null;
}

/** Partial override at any single layer. */
export type AutonomyConfigOverride = Partial<
  Pick<
    AutonomyConfig,
    "preset" | "enabled" | "tickIntervalMs" | "jitterRatio" | "perAgentCap" | "perUserCap"
  >
>;

/** Inputs the resolver needs to layer the config. */
export interface ResolveAutonomyScope {
  worldId: string;
  chatId: string;
  actorId?: string;
}
