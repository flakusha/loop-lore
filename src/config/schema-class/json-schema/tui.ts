// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/tui.ts — tui JSON Schema section
export const tui = {
  type: "object",
  properties: {
    enabled: { type: "boolean", default: true, description: "Enable TUI mode", },
  },
  required: ["enabled",],
};
