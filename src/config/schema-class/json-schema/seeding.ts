// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/seeding.ts — seeding JSON Schema section
export const seeding = {
  type: "object" as const,
  description: "Database seeding configuration (default users, characters, etc.)",
  properties: {
    enabled: {
      type: "boolean",
      default: false,
      description: "Enable seeding on first start",
    },
    users: {
      type: "array",
      description: "Default users to seed",
      items: {
        type: "object",
        properties: {
          handle: { type: "string", description: "User handle (login name)", },
          role: {
            type: "string",
            enum: ["admin", "user", "viewer", "solo",],
            description: "User role",
          },
        },
        required: ["handle", "role",] as const,
      },
    },
  },
  required: ["enabled", "users",] as const,
};