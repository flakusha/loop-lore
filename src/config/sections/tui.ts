// src/config/sections/tui.ts — TUI config section

import type { TuiConfig } from "../schema";

export const TUI_DEFAULTS = {
  enabled: true,
} satisfies TuiConfig;

export class TuiSection implements TuiConfig {
  enabled = TUI_DEFAULTS.enabled;

  constructor(overrides?: Partial<TuiConfig>) {
    Object.assign(this, overrides);
  }
}

export const tuiMeta = {
  type: "object" as const,
  properties: {
    enabled: { type: "boolean", default: TUI_DEFAULTS.enabled, description: "Enable TUI mode" },
  },
  required: ["enabled"] as const,
};
