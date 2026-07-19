/**
 * Browser logger — lightweight console wrapper with transport support.
 *
 * When transports are provided, entries flow through AsyncLogQueue
 * for batched dispatch. Otherwise falls back to direct console.* calls.
 */

import { levelFromConfig, shouldEmit } from "../../logger/levels";
import type { LogEntry, Logger, LoggerBindings, Transport } from "../../logger/types";
import type { LogLevel } from "../../logger/types";
import { LogLevelNumeric } from "../../logger/types";
import { formatTime, unixSec } from "../../utils/date";
import { AsyncLogQueue } from "./queue";
import { BrowserConsoleTransport } from "./transports/console";

export interface LightLoggerConfig {
  level?: LogLevel;
  transports?: Transport[];
}

class LightLogger implements Logger {
  private bindings: LoggerBindings;
  private readonly transports: Transport[];
  private readonly queue: AsyncLogQueue | null;
  private readonly threshold: number;
  private readonly levelString: LogLevel;

  constructor(config?: LightLoggerConfig, bindings?: LoggerBindings) {
    this.bindings = bindings ?? {};
    this.levelString = config?.level ?? "debug";
    this.threshold = levelFromConfig(this.levelString);
    this.transports = config?.transports ?? [];
    if (this.transports.length > 0) {
      this.queue = new AsyncLogQueue(this.transports);
      this.queue.start();
    } else {
      this.queue = null;
    }
  }

  private log(
    level: LogLevel,
    message: string | Record<string, unknown>,
    error?: Error,
    meta?: Record<string, unknown>,
  ): void {
    const numericLevel = LogLevelNumeric[level];
    if (!shouldEmit(numericLevel, this.threshold)) return;

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
      if (meta && Object.keys(meta).length > 0) {
        entry.meta = meta;
      }
      this.queue.enqueue(entry);
    } else {
      const prefix = this.bindings.module ? `[${this.bindings.module}]` : "";
      const fn = numericLevel >= 40
        ? console.error
        : numericLevel >= 30
        ? console.warn
        : numericLevel >= 20
        ? console.info
        : console.debug;
      if (error) {
        fn(prefix, message, error, meta ?? "");
      } else {
        fn(prefix, message, meta ?? "");
      }
    }
  }

  debug(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.log("debug", message, undefined, meta);
  }

  info(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.log("info", message, undefined, meta);
  }

  warn(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.log("warn", message, undefined, meta);
  }

  error(message: string | Record<string, unknown>, error?: Error, meta?: Record<string, unknown>): void {
    this.log("error", message, error, meta);
  }

  child(bindings: LoggerBindings): Logger {
    return new LightLogger(
      { level: this.levelString, transports: this.transports },
      { ...this.bindings, ...bindings },
    );
  }

  async flush(): Promise<void> {
    await this.queue?.flush();
  }

  addTransport(transport: Transport): void {
    this.transports.push(transport);
  }
  setBindings(partial: LoggerBindings): void {
    Object.assign(this.bindings, partial);
  }
}

// ── Factory API ─────────────────────────────────────────────

const _root: { instance: Logger | null } = { instance: null };

export function createLogger(config?: { level?: LogLevel }): Logger {
  const transports: Transport[] = [new BrowserConsoleTransport()];
  const instance = new LightLogger({ level: config?.level, transports });
  _root.instance ??= instance;
  return instance;
}

export function getLogger(): Logger {
  if (!_root.instance) throw new Error("Logger not initialized — call createLogger() first");
  return _root.instance;
}

export function setGlobalLogger(logger: Logger): void {
  _root.instance = logger;
}

export const log: Logger = createLogger();
