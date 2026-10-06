// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser logger — lightweight console wrapper with transport support.
 *
 * When transports are provided, entries flow through AsyncLogQueue
 * for batched dispatch. Otherwise falls back to direct console.* calls.
 */

import { levelFromConfig, shouldEmit, } from "../../logger/levels";
import type { LogEntry, Logger, LoggerBindings, LogLevel, Transport, } from "../../logger/types";
import { LogLevelNumeric, } from "../../logger/types";
import { formatTime, unixSec, } from "../../utils/date";
import { AsyncLogQueue, } from "./queue";
import { BrowserConsoleTransport, } from "./transports/console";

/** */
export interface LightLoggerConfig {
  level?: LogLevel;
  transports?: Transport[];
}

/** */
class LightLogger implements Logger {
  private bindings: LoggerBindings;
  private readonly transports: Transport[];
  private readonly queue: AsyncLogQueue | null;
  private levelBox: { name: LogLevel; threshold: number };

  /**
   * @param config
   * @param bindings
   */
  constructor(config?: LightLoggerConfig, bindings?: LoggerBindings,) {
    this.bindings = bindings ?? {};
    this.levelBox = { name: config?.level ?? "debug", threshold: levelFromConfig(config?.level ?? "debug",), };
    this.transports = config?.transports ?? [];
    if (this.transports.length > 0) {
      this.queue = new AsyncLogQueue(this.transports,);
      this.queue.start();
    } else {
      this.queue = null;
    }
  }

  /**
   * @param level
   * @param message
   * @param error
   * @param meta
   */
  private log(
    level: LogLevel,
    message: string | Record<string, unknown>,
    error?: Error,
    meta?: Record<string, unknown>,
  ): void {
    const numericLevel = LogLevelNumeric[level];
    if (!shouldEmit(numericLevel, this.levelBox.threshold,)) { return; }

    if (this.queue) {
      const entry: LogEntry = {
        level: numericLevel,
        timestamp: unixSec(),
        time: formatTime(),
        message,
        ...this.bindings,
      };

      if (error) {
        entry.error = error.stack ?? error.message;
      }

      if (meta && Object.keys(meta,).length > 0) {
        entry.meta = meta;
      }

      this.queue.enqueue(entry,);
    } else {
      const prefix = this.bindings.module ? `[${this.bindings.module}]` : "";
      let fn: typeof console.error;
      if (numericLevel >= 40) {
        fn = console.error;
      } else if (numericLevel >= 30) {
        fn = console.warn;
      } else if (numericLevel >= 20) {
        fn = console.info;
      } else {
        fn = console.debug;
      }

      if (error) {
        fn(prefix, message, error, meta ?? "",);
      } else {
        fn(prefix, message, meta ?? "",);
      }
    }
  }

  /**
   * @param message
   * @param meta
   */
  trace(message: string | Record<string, unknown>, meta?: Record<string, unknown>,): void {
    this.log("trace", message, undefined, meta,);
  }

  /**
   * @param message
   * @param meta
   */
  debug(message: string | Record<string, unknown>, meta?: Record<string, unknown>,): void {
    this.log("debug", message, undefined, meta,);
  }

  /**
   * @param message
   * @param meta
   */
  info(message: string | Record<string, unknown>, meta?: Record<string, unknown>,): void {
    this.log("info", message, undefined, meta,);
  }

  /**
   * @param message
   * @param meta
   */
  warn(message: string | Record<string, unknown>, meta?: Record<string, unknown>,): void {
    this.log("warn", message, undefined, meta,);
  }

  /**
   * @param message
   * @param error
   * @param meta
   */
  error(message: string | Record<string, unknown>, error?: Error, meta?: Record<string, unknown>,): void {
    this.log("error", message, error, meta,);
  }

  /**
   * @param message
   * @param error
   * @param meta
   */
  fatal(message: string | Record<string, unknown>, error?: Error, meta?: Record<string, unknown>,): void {
    this.log("fatal", message, error, meta,);
  }

  /**
   * @param bindings
   */
  child(bindings: LoggerBindings,): Logger {
    const child = new LightLogger(
      { level: this.levelBox.name, transports: this.transports, },
      { ...this.bindings, ...bindings, },
    );

    child.levelBox = this.levelBox;
    return child;
  }

  /** */
  /**
   * @returns {Promise<void>}
   */
  async flush(): Promise<void> {
    await this.queue?.flush();
  }

  /**
   * @param transport
   */
  addTransport(transport: Transport,): void {
    this.transports.push(transport,);
  }
  /**
   * @param partial
   */
  setBindings(partial: LoggerBindings,): void {
    Object.assign(this.bindings, partial,);
  }

  /**
   * @param level
   */
  setLevel(level: LogLevel,): void {
    this.levelBox.name = level;
    this.levelBox.threshold = levelFromConfig(level,);
  }
}

// ── Factory API ─────────────────────────────────────────────

const _root: { instance: Logger | null } = { instance: null, };

/**
 * @param config
 * @param config.level
 * @returns {Logger}
 */
export function createLogger(config?: { level?: LogLevel },): Logger {
  const transports: Transport[] = [new BrowserConsoleTransport(),];
  const instance = new LightLogger({ level: config?.level, transports, },);
  _root.instance ??= instance;
  return instance;
}

/**
 * @throws {Error}
 * @returns {Logger}
 */
export function getLogger(): Logger {
  if (!_root.instance) { throw new Error("Logger not initialized — call createLogger() first",); }
  return _root.instance;
}

/**
 * @param logger
 * @returns {void}
 */
export function setGlobalLogger(logger: Logger,): void {
  _root.instance = logger;
}

export const log: Logger = createLogger();
