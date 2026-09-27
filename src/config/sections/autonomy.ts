// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/autonomy.ts — Autonomy pacing config section
//
// Process-wide defaults for the autonomy resolver. The layered
// overrides (per-actor / per-chat / per-world) live in the database;
// this TOML section provides the lowest-precedence baseline read by
// the resolver before falling back to the built-in `organic` preset.

import type { AutonomyConfig, } from "../../autonomy/config/types";

export const AUTONOMY_DEFAULTS = {
  enabled: true,
  preset: "organic",
  /** Default per-tick cap; can be overridden at world or chat layer. */
  perAgentCap: 8,
  perUserCap: 24,
} satisfies Pick<AutonomyConfig, "enabled" | "preset" | "perAgentCap" | "perUserCap">;

/** */
export class AutonomySection implements AutonomyConfig {
  enabled = AUTONOMY_DEFAULTS.enabled;
  preset = AUTONOMY_DEFAULTS.preset as AutonomyConfig["preset"];
  tickIntervalMs = 0;
  jitterRatio = 0;
  perAgentCap = AUTONOMY_DEFAULTS.perAgentCap;
  perUserCap = AUTONOMY_DEFAULTS.perUserCap;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<typeof AUTONOMY_DEFAULTS>,) {
    Object.assign(this, overrides,);
  }
}

export const autonomyMeta = {
  type: "object" as const,
  description: "Process-wide defaults for the autonomy pacing resolver",
  properties: {
    enabled: {
      type: "boolean",
      default: AUTONOMY_DEFAULTS.enabled,
      description: "Master switch for autonomy pacing (per-tick; layered overrides in DB still apply)",
    },
    preset: {
      type: "string",
      enum: ["serene", "organic", "brisk", "unlimited-stress",],
      default: AUTONOMY_DEFAULTS.preset,
      description: "Default preset when no DB layer overrides it",
    },
    perAgentCap: {
      type: "integer",
      default: AUTONOMY_DEFAULTS.perAgentCap,
      description: "Default per-actor tick cap per chat session",
    },
    perUserCap: {
      type: "integer",
      default: AUTONOMY_DEFAULTS.perUserCap,
      description: "Default per-user tick cap per chat session",
    },
  },
  required: ["enabled", "preset", "perAgentCap", "perUserCap",] as const,
};