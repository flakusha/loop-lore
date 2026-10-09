// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Logger public API.
 *
 * Usage:
 *   import { createLogger } from "./logger";
 *   const log = createLogger(config.logging);
 *   log.info("server started", { port: 3000 });
 *   const reqLog = log.child({ requestId: "abc" });
 */

import { LoggerImpl, } from "./logger";
import type { Logger, LoggerConfig, } from "./types";

export type { Logger, LoggerBindings, LoggerConfig, LogOptions, } from "./types";
export type { LogEntry, LogLevel, } from "./types";

/** Global root logger holder */
const _root: { instance: Logger | null } = { instance: null, };

/**
 * Create a new root logger instance.
 * If global root not yet set, assigns it.
 * @param config
 * @returns {Logger}
 */
export function createLogger(config?: Partial<LoggerConfig>,): Logger {
  const instance = new LoggerImpl(config,);
  _root.instance ??= instance;
  return instance;
}

/**
 * Get the global root logger. Throws if not yet initialized.
 * @throws {Error}
 * @returns {Logger}
 */
export function getLogger(): Logger {
  if (!_root.instance) { throw new Error("Logger not initialized — call createLogger() first",); }
  return _root.instance;
}

/**
 * Set or replace the global root logger.
 * @param logger
 * @returns {void}
 */
export function setGlobalLogger(logger: Logger,): void {
  _root.instance = logger;
}

/** Memoized children, keyed by module name and tagged with the root they derive from. */
const _children = new Map<string, { root: Logger; child: Logger }>();

/**
 * Get a stable child logger for a module.
 *
 * `Logger.child()` allocates its own queue, so calling `getLogger().child(...)`
 * per statement hands every call a private queue — a later `flush()` drains an
 * empty one and the entries are lost. This memoizes per module name so the
 * caller and any shutdown flush share one queue. The entry is rebuilt whenever
 * the global root is replaced, so `setGlobalLogger` never leaves a child bound
 * to a dead root.
 * @param name module name, used as the `module` binding
 * @returns {Logger | null} null when no root logger is initialized yet
 */
export function getChildLogger(name: string,): Logger | null {
  try {
    const root = getLogger();
    const cached = _children.get(name,);
    if (cached?.root === root) { return cached.child; }
    const child = root.child({ module: name, },);
    _children.set(name, { root, child, },);
    return child;
  } catch {
    return null;
  }
}
