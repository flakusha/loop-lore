/**
 * Browser logger — always-on structured logging.
 *
 * Aligned with BE logger (src/logger/) but for browser:
 *   - AsyncLogQueue (port of BE queue.ts, 100ms/50 batch)
 *   - BrowserConsoleTransport (color via CSS)
 *   - ServerTransport (POST /api/frontend/logs, 5s flush)
 *   - PII censoring (port of BE censors.ts)
 *   - Size limits (port of BE limits.ts)
 *   - LogEntry format matches BE spec
 *   - Child loggers with full bindings
 */

import type {
  LogEntry,
  Logger,
  LoggerBindings,
  LogOptions,
  LoggerConfig,
  SizeLimits,
} from "../../logger/types";
import { LogLevelNumeric } from "../../logger/types";
import { levelFromConfig, shouldEmit } from "../../logger/levels";
import { applyLimits } from "../../logger/limits";
import { censorMeta, fieldNamesToRules } from "../../logger/censors";
import { unixSec, formatTime } from "../../utils/date";
import { AsyncLogQueue } from "./queue";
import { BrowserConsoleTransport } from "./transports/console";
import { ServerTransport } from "./transports/server";

// ── Implementation ─────────────────────────────────────────

class BrowserLoggerImpl implements Logger {
  private readonly queue: AsyncLogQueue;
  private readonly threshold: number;
  private readonly levelString: string;
  private readonly bindings: LoggerBindings;
  private readonly censorEnabled: boolean;
  private readonly censorFields: string[];
  private readonly limits: Partial<SizeLimits>;

  constructor(config?: Partial<LoggerConfig>, bindings?: LoggerBindings, queue?: AsyncLogQueue) {
    this.bindings = bindings ?? {};
    this.levelString = config?.level ?? "debug";
    this.threshold = levelFromConfig(this.levelString as any);
    this.censorEnabled = config?.censorEnabled ?? true;
    this.censorFields = config?.censorFields ?? [];
    this.limits = config?.limits ?? {};

    if (queue) {
      this.queue = queue;
    } else {
      const transports = [new BrowserConsoleTransport(), new ServerTransport()];
      this.queue = new AsyncLogQueue(transports, {
        queueMaxSize: config?.queueMaxSize ?? 10_000,
      });
      this.queue.start();
    }
  }

  private log(
    level: string,
    message: string | Record<string, unknown>,
    error?: Error,
    meta?: Record<string, unknown>,
    _options?: LogOptions,
  ): void {
    const numericLevel = LogLevelNumeric[level as keyof typeof LogLevelNumeric];
    if (!shouldEmit(numericLevel, this.threshold)) return;

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
      entry.meta = this.censorEnabled ? censorMeta(meta, fieldNamesToRules(this.censorFields)) : meta;
    }

    const limited = applyLimits(entry, this.limits);
    this.queue.enqueue(limited);
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
    return new BrowserLoggerImpl(
      {
        level: this.levelString as any,
        censorEnabled: this.censorEnabled,
        censorFields: this.censorFields,
        limits: this.limits,
      },
      { ...this.bindings, ...bindings },
      this.queue,
    );
  }

  async flush(): Promise<void> {
    await this.queue.flush();
  }
}

// ── Factory API ─────────────────────────────────────────────

const _root: { instance: Logger | null } = { instance: null };

export function createLogger(config?: Partial<LoggerConfig>): Logger {
  const instance = new BrowserLoggerImpl(config);
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
