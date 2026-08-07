// src/config/schema/logging.ts — Logging config type

import type { LogLevel as LogLevelT, } from "../../db/enums";

export interface LoggingConfig {
  level: LogLevelT;
  /** JSONL output path. Unset = disabled. */
  jsonlPath?: string;
  /** Max JSONL file bytes before rotation. Default 100 MB. */
  jsonlMaxBytes?: number;
  /** Max rotated files to keep. Default 5. */
  jsonlMaxFiles?: number;
  /** Enable DB log transport. Default false. */
  dbEnabled?: boolean;
  /** PII censor toggle. Default true. */
  censorEnabled?: boolean;
  /** Extra PII field patterns (merged with defaults). */
  censorFields?: string[];
  /** Max queue entries before dropping. Default 10_000. */
  queueMaxSize?: number;
  /** Max message string bytes before truncation. */
  maxMessageBytes?: number;
  /** Max meta blob bytes before truncation. */
  maxMetaBytes?: number;
  /** Max meta recursion depth. */
  maxMetaDepth?: number;
  /** Max error stack bytes before truncation. */
  maxStackBytes?: number;
}
