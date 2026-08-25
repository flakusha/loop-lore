// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Logger class — core implementation.
 *
 * Flow per log() call:
 *   level filter → timestamp → censor → limits → enqueue
 */
import { formatTime, unixSec, } from "../utils/date";
import { censorMeta, fieldNamesToRules, } from "./censors";
import { levelFromConfig, shouldEmit, } from "./levels";
import { applyLimits, } from "./limits";
import { AsyncLogQueue, } from "./queue";
import { ConsoleTransport, } from "./transports/console";
import { FileTransport, } from "./transports/file";
import type {
  LogEntry,
  Logger,
  LoggerBindings,
  LoggerConfig,
  LogLevel,
  LogOptions,
  SizeLimits,
  Transport,
} from "./types";
import { LogLevelNumeric, } from "./types";

export class LoggerImpl implements Logger {
  private transports: Transport[];
  private readonly queue: AsyncLogQueue;
  private readonly threshold: number;
  private readonly levelString: LogLevel;
  private bindings: LoggerBindings;
  private readonly censorEnabled: boolean;
  private readonly censorFields: string[];
  private readonly limits: Partial<SizeLimits>;

  constructor(config?: Partial<LoggerConfig>, bindings?: LoggerBindings,) {
    this.bindings = bindings ?? {};
    this.levelString = config?.level ?? "debug";
    this.threshold = levelFromConfig(this.levelString,);
    this.censorEnabled = config?.censorEnabled ?? true;
    this.censorFields = config?.censorFields ?? [];

    // Normalize: config schema (LoggingConfig) passes size limits flattened at top level.
    // LoggerConfig nests them under `limits`. Support both.
    const limitsFromNested = config?.limits ?? {};
    const limitsFromFlat: Partial<SizeLimits> = {};
    if (config) {
      const c = config as {
        maxMessageBytes?: number;
        maxMetaBytes?: number;
        maxMetaDepth?: number;
        maxStackBytes?: number;
      };
      if (c.maxMessageBytes != null) { limitsFromFlat.maxMessageBytes = c.maxMessageBytes; }
      if (c.maxMetaBytes != null) { limitsFromFlat.maxMetaBytes = c.maxMetaBytes; }
      if (c.maxMetaDepth != null) { limitsFromFlat.maxMetaDepth = c.maxMetaDepth; }
      if (c.maxStackBytes != null) { limitsFromFlat.maxStackBytes = c.maxStackBytes; }
    }
    this.limits = { ...limitsFromNested, ...limitsFromFlat, };

    this.transports = [new ConsoleTransport(),];
    // Canonical machine-readable JSONL output when a path is configured.
    if (config?.jsonlPath) {
      this.transports.push(
        new FileTransport({
          path: config.jsonlPath,
          maxBytes: config.jsonlMaxBytes,
          maxFiles: config.jsonlMaxFiles,
        },),
      );
    }

    this.queue = new AsyncLogQueue(this.transports, {
      queueMaxSize: config?.queueMaxSize ?? 10_000,
    },);
    this.queue.start();
  }

  private log(
    level: LogLevel,
    message: string | Record<string, unknown>,
    error?: Error,
    meta?: Record<string, unknown>,
    options?: LogOptions,
  ): void {
    const numericLevel = LogLevelNumeric[level];
    if (!shouldEmit(numericLevel, this.threshold,)) { return; }

    // Censor structured messages: object messages carry key-value PII/secrets
    // (logger.info({ password })) and previously bypassed censoring entirely.
    // Free-text string messages pass through (no reliable content censoring).
    // null/undefined/primitives pass through — only real objects are censored
    // (applyLimits crashes on Object.keys(null), and there is nothing to censor).
    const isCensorable = typeof message === "object" && message !== null;
    const safeMessage: string | Record<string, unknown> =
      options?.skipCensor || !isCensorable
        ? (message as string | Record<string, unknown>)
        : censorMeta({ meta: message, extraRules: fieldNamesToRules(this.censorFields,), },) ?? message;

    // Build entry
    const entry: LogEntry = {
      level: numericLevel,
      timestamp: unixSec(),
      time: formatTime(),
      message: safeMessage,
      ...this.bindings,
    };

    // Attach error
    if (error) {
      entry.error = error.stack ?? error.message;
    }

    // Attach meta and censor
    if (meta && Object.keys(meta,).length > 0) {
      entry.meta = options?.skipCensor
        ? meta
        : censorMeta({ meta, extraRules: fieldNamesToRules(this.censorFields,), },);
    }

    // Apply size limits
    const limited = applyLimits(entry, this.limits,);

    // Enqueue for async dispatch
    this.queue.enqueue(limited,);
  }

  trace(message: string | Record<string, unknown>, meta?: Record<string, unknown>,): void {
    this.log("trace", message, undefined, meta,);
  }

  debug(message: string | Record<string, unknown>, meta?: Record<string, unknown>,): void {
    this.log("debug", message, undefined, meta,);
  }

  info(message: string | Record<string, unknown>, meta?: Record<string, unknown>,): void {
    this.log("info", message, undefined, meta,);
  }

  warn(message: string | Record<string, unknown>, meta?: Record<string, unknown>,): void {
    this.log("warn", message, undefined, meta,);
  }

  error(message: string | Record<string, unknown>, error?: Error, meta?: Record<string, unknown>,): void {
    this.log("error", message, error, meta,);
  }

  fatal(message: string | Record<string, unknown>, error?: Error, meta?: Record<string, unknown>,): void {
    this.log("fatal", message, error, meta,);
  }

  child(bindings: LoggerBindings,): Logger {
    return new LoggerImpl(
      {
        level: this.levelString,
        censorEnabled: this.censorEnabled,
        censorFields: this.censorFields,
        limits: this.limits,
      },
      { ...this.bindings, ...bindings, },
    );
  }

  addTransport(transport: Transport,): void {
    this.transports.push(transport,);
  }

  setBindings(partial: LoggerBindings,): void {
    this.bindings = { ...this.bindings, ...partial, };
  }

  async flush(): Promise<void> {
    await this.queue.flush();
    const results = await Promise.allSettled(
      Array.from(this.transports, (t,) => t.flush(),),
    );
    for (const r of results) {
      if (r.status === "rejected") { throw r.reason; }
    }
  }
}
