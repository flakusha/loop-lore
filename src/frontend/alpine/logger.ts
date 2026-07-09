/**
 * Browser logger — lightweight console wrapper.
 *
 * Drops heavy queue/transport/censor machinery from FE bundles.
 * Same Logger interface, same exports, zero deps.
 */

import type { Logger, LoggerBindings } from "../../logger/types";

class LightLogger implements Logger {
  private readonly bindings: LoggerBindings;

  constructor(bindings?: LoggerBindings) {
    this.bindings = bindings ?? {};
  }

  private prefix(): string {
    return this.bindings.module ? `[${this.bindings.module}]` : "";
  }

  debug(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    console.debug(this.prefix(), message, meta ?? "");
  }

  info(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    console.info(this.prefix(), message, meta ?? "");
  }

  warn(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    console.warn(this.prefix(), message, meta ?? "");
  }

  error(message: string | Record<string, unknown>, error?: Error, meta?: Record<string, unknown>): void {
    console.error(this.prefix(), message, error ?? "", meta ?? "");
  }

  child(bindings: LoggerBindings): Logger {
    return new LightLogger({ ...this.bindings, ...bindings });
  }

  async flush(): Promise<void> {
    /* no-op — lightweight logger has no queue */
  }
}

// ── Factory API ─────────────────────────────────────────────

const _root: { instance: Logger | null } = { instance: null };

export function createLogger(_config?: unknown): Logger {
  const instance = new LightLogger();
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
