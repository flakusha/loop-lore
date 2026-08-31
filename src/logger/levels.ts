// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Log level helpers — numeric mapping and config parsing.
 */

import type { LogLevel as LogLevelT, } from "./types";

export { LogLevel, LogLevelNumeric, } from "./types";

/**
 * Convert config string to numeric threshold.
 * Entries with level < threshold are filtered out.
 * @param level
 */
export function levelFromConfig(level: LogLevelT,): number {
  switch (level) {
    case "trace": {
      return 5;
    }
    case "debug": {
      return 10;
    }
    case "info": {
      return 20;
    }
    case "warn": {
      return 30;
    }
    case "error": {
      return 40;
    }
    case "fatal": {
      return 50;
    }
    default: {
      return 20; // safe default
    }
  }
}

/**
 * Map numeric level back to string label for console output.
 * @param numeric
 */
export function numericToLabel(numeric: number,): string {
  switch (numeric) {
    case 5: {
      return "TRACE";
    }
    case 10: {
      return "DEBUG";
    }
    case 20: {
      return "INFO";
    }
    case 30: {
      return "WARN";
    }
    case 40: {
      return "ERROR";
    }
    case 50: {
      return "FATAL";
    }
    default: {
      return String(numeric,);
    }
  }
}

/**
 * Check if a numeric log level should be emitted at given threshold.
 * @param entryLevel
 * @param threshold
 */
export function shouldEmit(entryLevel: number, threshold: number,): boolean {
  return entryLevel >= threshold;
}
