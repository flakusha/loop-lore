// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/autonomy.ts — Autonomy config type

import type { AutonomyConfig, } from "../../autonomy/config/types";

/**
 * Process-wide autonomy pacing defaults. Layered overrides live in
 * the database (chats.autonomy_config, worlds.autonomy_config,
 * character_internal_traits.autonomy_preferences.autonomy).
 */
export interface AutonomyConfigSection extends Pick<
  AutonomyConfig,
  "enabled" | "preset" | "perAgentCap" | "perUserCap"
> {}