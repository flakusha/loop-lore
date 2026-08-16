// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/hooks.ts — hooks section defaults
import type { HooksConfig, } from "../schema";

export const HOOKS_DEFAULTS = {
  enableMoodHooks: true,
  enableEmotionHooks: true,
  enableNsfwHooks: true,
  enableModerationHooks: true,
} satisfies HooksConfig;
