// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/frontend.ts — frontend JSON Schema section
export const frontend = {
  type: "object" as const,
  description: "Frontend rendering mode configuration",
  properties: {
    mode: {
      type: "string",
      enum: ["htmx",],
      default: "htmx",
      description: "Frontend rendering strategy (htmx + Alpine.js)",
    },
  },
  required: ["mode",] as const,
};