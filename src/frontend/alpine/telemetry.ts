/**
 * Frontend Telemetry
 *
 * Wires TelemetryTransport into the browser logger on init.
 * Provides trackClick helper for Alpine @click handlers.
 *
 * Dev: auto-enabled when NODE_ENV !== "production" (env-overridable). Prod: opt-in via TELEMETRY_* env vars, gated by server-injected global.
 */
import { getLogger, } from "./logger";
import { TelemetryTransport, } from "./transports/telemetry";

let _initialized = false;

export function initTelemetry(): void {
  if (_initialized) { return; }
  _initialized = true;

  const enabled = [true, "true", 1,].includes(globalThis.__TELEMETRY_FRONTEND_ENABLED,);

  if (!enabled) { return; }

  try {
    const logger = getLogger();
    logger.addTransport(new TelemetryTransport(),);
    logger.setBindings({
      userId: globalThis.__USER_ID ?? undefined,
      sessionId: globalThis.__SESSION_ID ?? undefined,
    },);
  } catch {
    // logger not ready yet
  }

  document.addEventListener("htmx:afterSettle", () => {
    try {
      getLogger().info("frontend.page_view", { path: location.pathname, },);
    } catch {
      /* noop */
    }
  },);

  globalThis.addEventListener("error", (event: ErrorEvent,) => {
    try {
      getLogger().error("frontend.error", undefined, {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },);
    } catch {
      /* noop */
    }
  },);

  globalThis.addEventListener("unhandledrejection", (event: PromiseRejectionEvent,) => {
    try {
      getLogger().error("frontend.error", undefined, {
        message: event.reason?.message ?? String(event.reason,),
        type: "unhandledrejection",
      },);
    } catch {
      /* noop */
    }
  },);
}

export function isTelemetryEnabled(): boolean {
  return [true, "true", 1,].includes(globalThis.__TELEMETRY_FRONTEND_ENABLED,);
}
