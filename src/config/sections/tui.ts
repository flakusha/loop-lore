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
  // sessionToken intentionally has no default; absence = anonymous mode.
  sessionToken?: string;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<TuiConfig>,) {
    Object.assign(this, overrides,);
    // Normalize empty string from TOML into undefined so an accidental
    // blank token doesn't ship as a Bearer header and trip 401s.
    if (this.sessionToken === "") { this.sessionToken = undefined; }
  }
}

export const tuiMeta = {
  type: "object" as const,
  properties: {
    enabled: { type: "boolean", default: TUI_DEFAULTS.enabled, description: "Enable TUI mode", },
    sessionToken: {
      type: "string",
      description: "Bearer token for authenticated chat routes; omit to run anonymous against solo deployments.",
    },
  },
  required: ["enabled",] as const,
};
