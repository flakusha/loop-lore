/**
 * Logger public API.
 *
 * Usage:
 *   import { createLogger } from "./logger";
 *   const log = createLogger(config.logging);
 *   log.info("server started", { port: 3000 });
 *   const reqLog = log.child({ requestId: "abc" });
 */

import { LoggerImpl } from "./logger";
import type { Logger, LoggerConfig } from "./types";

export type { Logger, LoggerConfig, LoggerBindings, LogOptions } from "./types";
export type { LogLevel, LogEntry } from "./types";

/** Global root logger holder */
const _root: { instance: Logger | null } = { instance: null };

/**
 * Create a new root logger instance.
 * If global root not yet set, assigns it.
 */
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  const instance = new LoggerImpl(config);
  _root.instance ??= instance;
  return instance;
}

/**
 * Get the global root logger. Throws if not yet initialized.
 */
export function getLogger(): Logger {
  if (!_root.instance) throw new Error("Logger not initialized — call createLogger() first");
  return _root.instance;
}

/**
 * Set or replace the global root logger.
 */
export function setGlobalLogger(logger: Logger): void {
  _root.instance = logger;
}
