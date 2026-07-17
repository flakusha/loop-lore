/**
 * Frontend Telemetry
 *
 * Wires TelemetryTransport into the browser logger on init.
 * Provides trackClick helper for Alpine @click handlers.
 *
 * Dev: always enabled. Prod: gated by server-rendered config flag.
 */
import { getLogger } from "./logger";
import { TelemetryTransport } from "./transports/telemetry";

let _initialized = false;

export function initTelemetry(): void {
  if (_initialized) return;
  _initialized = true;

  const enabled =
    (globalThis as any).__TELEMETRY_FRONTEND_ENABLED === true ||
    (globalThis as any).__TELEMETRY_FRONTEND_ENABLED === "true" ||
    (globalThis as any).__TELEMETRY_FRONTEND_ENABLED === 1;

  if (!enabled) return;

  try {
    const logger = getLogger();
    logger.addTransport(new TelemetryTransport());
  } catch {
    // logger not ready yet
  }

  document.addEventListener("htmx:afterSettle", () => {
    try {
      getLogger().info("frontend.page_view", { path: location.pathname });
    } catch {
      /* noop */
    }
  });

  globalThis.addEventListener("error", (event: ErrorEvent) => {
    try {
      getLogger().error("frontend.error", undefined, {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    } catch {
      /* noop */
    }
  });

  globalThis.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    try {
      getLogger().error("frontend.error", undefined, {
        message: event.reason?.message ?? String(event.reason),
        type: "unhandledrejection",
      });
    } catch {
      /* noop */
    }
  });
}

export function isTelemetryEnabled(): boolean {
  return (
    (globalThis as any).__TELEMETRY_FRONTEND_ENABLED === true ||
    (globalThis as any).__TELEMETRY_FRONTEND_ENABLED === "true" ||
    (globalThis as any).__TELEMETRY_FRONTEND_ENABLED === 1
  );
}
