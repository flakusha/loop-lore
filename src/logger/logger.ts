/**
 * Logger class — core implementation.
 *
 * Flow per log() call:
 *   level filter → timestamp → censor → limits → enqueue
 */
import { formatTime, unixSec, } from "../utils/date";
import { formatTime, unixSec, } from "../utils/date";
import { censorMeta, fieldNamesToRules, } from "./censors";
import { levelFromConfig, shouldEmit, } from "./levels";
import { applyLimits, } from "./limits";
import { AsyncLogQueue, } from "./queue";
import { ConsoleTransport, } from "./transports/console";
import type { LogEntry, Logger, LoggerBindings, LogOptions, Transport, } from "./types";
import type { LogLevel, } from "./types";
import type { LoggerConfig, SizeLimits, } from "./types";
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
    // Future: JSONLTransport, DBTransport added here when config provided

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

    // Build entry
    const entry: LogEntry = {
      level: numericLevel,
      timestamp: unixSec(),
      time: formatTime(),
      message,
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
    await Promise.all(this.transports.map((t,) => t.flush()),);
  }
}
