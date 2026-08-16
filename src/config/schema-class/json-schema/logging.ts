// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/logging.ts — logging JSON Schema section
export const logging = {
  type: "object",
  description: "Logging configuration",
  properties: {
    level: {
      type: "string",
      enum: ["trace", "debug", "info", "warn", "error", "fatal",],
      default: "debug",
      description: "Log level",
    },
    jsonlPath: { type: "string", description: "JSONL output path", },
    jsonlMaxBytes: {
      type: "integer",
      default: 104_857_600,
      description: "Max JSONL file bytes before rotation",
    },
    jsonlMaxFiles: { type: "integer", default: 5, description: "Max rotated files to keep", },
    dbEnabled: { type: "boolean", default: false, description: "Enable DB log transport", },
    censorEnabled: { type: "boolean", default: true, description: "PII redaction", },
    censorFields: {
      type: "array",
      items: { type: "string", },
      description: "Extra PII field patterns",
    },
    queueMaxSize: { type: "integer", default: 10_000, description: "Max queue entries", },
    maxMessageBytes: { type: "integer", default: 10_240, description: "Max message string bytes", },
    maxMetaBytes: { type: "integer", default: 102_400, description: "Max meta blob bytes", },
    maxMetaDepth: { type: "integer", default: 5, description: "Max meta recursion depth", },
    maxStackBytes: { type: "integer", default: 5120, description: "Max error stack bytes", },
  },
  required: ["level",],
};
