// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/docs.ts — documentation JSON Schema section
export const docs = {
  type: "object",
  properties: {
    enabled: { type: "boolean", default: true, description: "Enable documentation serving", },
    public: {
      type: "array",
      items: { type: "string", },
      description: "Allowlist of doc path prefixes",
    },
  },
  required: ["enabled",],
};
