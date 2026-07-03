/**
 * Logger types — LogEntry, Logger, Transport, support interfaces.
 */

// ── Log Levels ─────────────────────────────────────────────

export const LogLevel = {
  Debug: "debug",
  Info: "info",
  Warn: "warn",
  Error: "error",
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/** Numeric level values — higher = more severe */
export const LogLevelNumeric: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const;

// ── Log Entry ──────────────────────────────────────────────

export interface LogEntry {
  /** Numeric level: 10|20|30|40 */
  level: number;
  /** Unix epoch seconds */
  timestamp: number;
  /** Compact ISO with TZ: "20260704T143000.123+02:00" */
  time: string;
  /** Message — string or structured data */
  message: string | Record<string, unknown>;
  /** Module/component name */
  module?: string;
  /** Request ID for tracing */
  requestId?: string;
  /** User ID */
  userId?: string;
  /** Session ID */
  sessionId?: string;
  /** Error info — description or minified stack */
  error?: string;
  /** Additional structured data (post-censor) */
  meta?: Record<string, unknown>;
}

// ── Logger Interface ───────────────────────────────────────

export interface Logger {
  debug(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void;
  info(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void;
  warn(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void;
  error(
    message: string | Record<string, unknown>,
    error?: Error,
    meta?: Record<string, unknown>,
  ): void;

  /** Create child logger with inherited bindings */
  child(bindings: LoggerBindings): Logger;

  /** Flush pending entries (await before shutdown) */
  flush(): Promise<void>;
}

export interface LoggerBindings {
  module?: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
}

/** Optional per-entry overrides */
export interface LogOptions {
  skipCensor?: boolean;
}

// ── Transport Interface ────────────────────────────────────

export interface Transport {
  /** Label for debugging/logging */
  readonly name: string;

  /** Write a single log entry. Must not throw — catch errors internally. */
  write(entry: LogEntry): Promise<void>;

  /** Flush any pending writes (for transports with internal buffering). */
  flush(): Promise<void>;
}

// ── Censor Engine Types ────────────────────────────────────

export interface CensorRule {
  /** Field name pattern (case-insensitive, glob-style: "api*") */
  field: string;
  /** Replacement value. Default: "[REDACTED]" */
  replacement?: string;
  /** Only censor if value matches this pattern */
  pattern?: RegExp;
}

// ── Size Limits ────────────────────────────────────────────

export interface SizeLimits {
  maxMessageBytes?: number;
  maxMetaBytes?: number;
  maxMetaDepth?: number;
  maxStackBytes?: number;
  maxMessageKeys?: number;
  maxMetaEntries?: number;
}

// ── Logger Config (extends schema) ─────────────────────────

export interface LoggerConfig {
  /** Runtime level threshold: "debug" | "info" | "warn" | "error" */
  level: LogLevel;
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
  /** Entry size limits. */
  limits?: SizeLimits;
  /** Max queue entries before dropping. Default 10_000. */
  queueMaxSize?: number;
}

// ── Factory ────────────────────────────────────────────────

export type LoggerFactory = (config?: Partial<LoggerConfig>) => Logger;
