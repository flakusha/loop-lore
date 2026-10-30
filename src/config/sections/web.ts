// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/web.ts — Web editor + browser-terminal config section

import type { WebTerminalConfig, } from "../schema";

export const WEB_TERMINAL_DEFAULTS = {
  enabled: false,
  allowRemote: false,
} satisfies WebTerminalConfig;

export const WEB_DEFAULTS = {
  editor: "vscode",
  terminal: { ...WEB_TERMINAL_DEFAULTS, },
};

/** Overrides accept a partial terminal object; unspecified terminal keys keep their defaults. */
export interface WebSectionOverrides extends Partial<Omit<WebSection, "terminal">> {
  terminal?: Partial<WebTerminalConfig>;
}

/** */
export class WebSection {
  editor = WEB_DEFAULTS.editor;
  terminal: WebTerminalConfig = { ...WEB_TERMINAL_DEFAULTS, };

  /**
   * @param overrides
   */
  constructor(overrides?: WebSectionOverrides,) {
    if (!overrides) { return; }

    const { terminal, ...rest } = overrides;
    Object.assign(this, rest,);
    if (terminal) {
      this.terminal = { ...this.terminal, ...terminal, };
    }
  }
}

export const webMeta = {
  type: "object" as const,
  description: "Web editor and browser-terminal configuration",
  properties: {
    editor: {
      type: "string",
      default: WEB_DEFAULTS.editor,
      description: "Editor scheme for open-in-editor links (vscode, zed, cursor, idea)",
    },
    terminal: {
      type: "object",
      description: "Browser PTY terminal settings (WS /api/v1/terminal)",
      properties: {
        enabled: {
          type: "boolean",
          default: WEB_TERMINAL_DEFAULTS.enabled,
          description: "Enable the browser-terminal route (default false)",
        },
        allowRemote: {
          type: "boolean",
          default: WEB_TERMINAL_DEFAULTS.allowRemote,
          description: "Allow non-localhost clients to open the PTY (default false)",
        },
      },
      required: ["enabled", "allowRemote",] as const,
    },
  },
  required: ["editor", "terminal",] as const,
};
