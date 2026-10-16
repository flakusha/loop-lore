// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/tui.ts — TUI config section

export const TUI_DEFAULTS = {
  enabled: true,
  // Sending a message blocks on a whole assistant generation (see
  // src/routes/messages/create.ts), so the shared 30s safeFetch default
  // aborts long RPG turns the server actually completes. Sized to the
  // server-side budget in `messages.generationTimeoutMs`.
  sendTimeoutMs: 300_000,
};

/** */
export class TuiSection {
  enabled = TUI_DEFAULTS.enabled;
  sendTimeoutMs = TUI_DEFAULTS.sendTimeoutMs;
  // sessionToken intentionally has no default; absence = anonymous mode.
  sessionToken?: string;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<TuiSection>,) {
    Object.assign(this, overrides,);
    // Normalize empty string from TOML into undefined so an accidental
    // blank token doesn't ship as a Bearer header and trip 401s.
    if (this.sessionToken === "") { this.sessionToken = undefined; }
  }
}

export type TuiConfig = TuiSection;

export const tuiMeta = {
  type: "object" as const,
  properties: {
    enabled: { type: "boolean", default: TUI_DEFAULTS.enabled, description: "Enable TUI mode", },
    sendTimeoutMs: {
      type: "integer",
      default: TUI_DEFAULTS.sendTimeoutMs,
      description: "Send-message timeout in ms; covers one full assistant generation",
    },
    sessionToken: {
      type: "string",
      description: "Bearer token for authenticated chat routes; omit to run anonymous against solo deployments.",
    },
  },
  required: ["enabled", "sendTimeoutMs",] as const,
};
