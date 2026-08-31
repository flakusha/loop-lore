// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/logging.ts — Logging config section

import { LogLevel, } from "../../db/enums";
import type { LoggingConfig, } from "../schema";

export const LOGGING_DEFAULTS = {
  level: LogLevel.Debug,
} satisfies LoggingConfig;

/** */
export class LoggingSection implements LoggingConfig {
  level = LOGGING_DEFAULTS.level;
  jsonlPath?: string;
  jsonlMaxBytes?: number;
  jsonlMaxFiles?: number;
  dbEnabled?: boolean;
  censorEnabled?: boolean;
  censorFields?: string[];
  queueMaxSize?: number;
  maxMessageBytes?: number;
  maxMetaBytes?: number;
  maxMetaDepth?: number;
  maxStackBytes?: number;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<LoggingConfig>,) {
    Object.assign(this, overrides,);
  }
}

export const loggingMeta = {
  type: "object" as const,
  description: "Logging configuration",
  properties: {
    level: {
      type: "string",
      enum: ["trace", "debug", "info", "warn", "error", "fatal",],
      description: "Log level",
    },
    jsonlPath: { type: "string", description: "JSONL output path", },
    jsonlMaxBytes: {
      type: "integer",
      description: "Max JSONL file bytes before rotation",
    },
    jsonlMaxFiles: {
      type: "integer",
      description: "Max rotated files to keep",
    },
    dbEnabled: { type: "boolean", description: "Enable DB log transport", },
    censorEnabled: { type: "boolean", description: "PII redaction", },
    censorFields: {
      type: "array",
      items: { type: "string", },
      description: "Extra PII field patterns",
    },
    queueMaxSize: {
      type: "integer",
      description: "Max queue entries",
    },
    maxMessageBytes: {
      type: "integer",
      description: "Max message string bytes",
    },
    maxMetaBytes: {
      type: "integer",
      description: "Max meta blob bytes",
    },
    maxMetaDepth: {
      type: "integer",
      description: "Max meta recursion depth",
    },
    maxStackBytes: {
      type: "integer",
      description: "Max error stack bytes",
    },
  },
  required: ["level",] as const,
};
