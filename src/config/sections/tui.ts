// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/tui.ts — TUI config section

import type { TuiConfig, } from "../schema";

export const TUI_DEFAULTS = {
  enabled: true,
} satisfies TuiConfig;

/** */
export class TuiSection implements TuiConfig {
  enabled = TUI_DEFAULTS.enabled;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<TuiConfig>,) {
    Object.assign(this, overrides,);
  }
}

export const tuiMeta = {
  type: "object" as const,
  properties: {
    enabled: { type: "boolean", default: TUI_DEFAULTS.enabled, description: "Enable TUI mode", },
  },
  required: ["enabled",] as const,
};
