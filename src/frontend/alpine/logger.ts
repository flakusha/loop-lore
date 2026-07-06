/**
 * Browser logger — mirrors server-side Logger API for frontend code.
 *
 * Features:
 *   - Level filtering (debug/info/warn/error)
 *   - Child loggers with module prefix
 *   - Gated behind DEBUG flag — silent in production by default
 *   - Formatted console output (timestamp + level + module)
 *
 * Usage:
 *   import { createLogger } from "./logger";
 *   const log = createLogger();
 *   log.info("chat loaded", { messageCount: 42 });
 *   const charLog = log.child({ module: "characters" });
 *   charLog.debug("init started");
 *
 * Gate:
 *   Enabled when localStorage.getItem("debug") is truthy
 *   or window.__DEBUG__ is set.
 */

// ── Types (mirrors src/logger/types.ts subset) ─────────────

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const LEVEL_LABELS: Record<number, string> = {
  10: "DEBUG",
  20: "INFO",
  30: "WARN",
  40: "ERROR",
};

interface LoggerBindings {
  module?: string;
}

interface BrowserLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: LoggerBindings): BrowserLogger;
}

interface BrowserLoggerConfig {
  level?: LogLevel;
}

// ── Gate check ─────────────────────────────────────────────

function isLoggingEnabled(): boolean {
  try {
    return !!localStorage.getItem("debug") || !!(globalThis as any).__DEBUG__;
  } catch {
    return false;
  }
}

// ── Implementation ─────────────────────────────────────────

class BrowserLoggerImpl implements BrowserLogger {
  private readonly threshold: number;
  private readonly enabled: boolean;
  private readonly module?: string;

  constructor(config?: BrowserLoggerConfig, module?: string) {
    this.threshold = LOG_LEVELS[config?.level ?? "debug"];
    this.enabled = isLoggingEnabled();
    this.module = module;
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.enabled) return;

    const numeric = LOG_LEVELS[level];
    if (numeric < this.threshold) return;

    const label = LEVEL_LABELS[numeric];
    const modulePart = this.module ? ` [${this.module}]` : "";
    const ts = new Date().toISOString();

    const formatted = `[${ts}] [${label}]${modulePart} ${message}`;

    const consoleFn = this.getConsoleMethod(level);
    if (meta && Object.keys(meta).length > 0) {
      consoleFn(formatted, meta);
    } else {
      consoleFn(formatted);
    }
  }

  private getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
    switch (level) {
      case "debug":
        return console.debug;
      case "warn":
        return console.warn;
      case "error":
        return console.error;
      default:
        return console.log;
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }

  child(bindings: LoggerBindings): BrowserLogger {
    const childModule = bindings.module
      ? this.module
        ? `${this.module}:${bindings.module}`
        : bindings.module
      : this.module;

    return new BrowserLoggerImpl({ level: this.levelFromThreshold() }, childModule);
  }

  /** Derive level string from numeric threshold for child propagation */
  private levelFromThreshold(): LogLevel {
    if (this.threshold <= LOG_LEVELS.debug) return "debug";
    if (this.threshold <= LOG_LEVELS.info) return "info";
    if (this.threshold <= LOG_LEVELS.warn) return "warn";
    return "error";
  }
}

// ── Factory ────────────────────────────────────────────────

/** Create root browser logger. */
export function createLogger(config?: BrowserLoggerConfig): BrowserLogger {
  return new BrowserLoggerImpl(config);
}

/** Pre-built root logger for app-wide use. */
export const log: BrowserLogger = createLogger();
