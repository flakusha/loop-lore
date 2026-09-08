// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/observability.ts — observability JSON Schema section

export const observability = {
  type: "object",
  description: "Observability exposure (liveness/readiness probes + Prometheus metrics). All opt-in.",
  properties: {
    health: {
      type: "object",
      description: "Liveness/readiness probe opt-in.",
      properties: {
        liveness: {
          type: "boolean",
          default: false,
          description: "Enable /health/live liveness probe.",
        },
        readiness: {
          type: "boolean",
          default: false,
          description: "Enable /health/ready readiness probe.",
        },
      },
      required: ["liveness", "readiness",],
    },
    metrics: {
      type: "object",
      description: "Prometheus scrape opt-in.",
      properties: {
        enabled: {
          type: "boolean",
          default: false,
          description: "Enable the /metrics Prometheus text-format endpoint.",
        },
      },
      required: ["enabled",],
    },
  },
  required: ["health", "metrics",],
};
