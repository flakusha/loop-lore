// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/cron.ts — cron JSON Schema section
export const cron = {
  type: "object",
  description: "Internal scheduled tasks (Bun.cron registry)",
  properties: {
    enabled: { type: "boolean", default: true, description: "Master toggle", },
    jobs: {
      type: "object",
      description: "Per-job overrides keyed by job name",
      additionalProperties: {
        type: "object",
        properties: {
          enabled: { type: "boolean", description: "Enable this job", },
          schedule: { type: "string", description: "Cron expression override", },
        },
      },
    },
  },
  required: ["enabled",],
};
