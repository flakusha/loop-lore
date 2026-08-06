/**
 * Frontend Telemetry
 *
 * Wires TelemetryTransport into the browser logger on init.
 * Provides trackTelemetry for curated, high-signal events (page_view, generation.*).
 *
 * The transport is NOT a full log passthrough: warn/error ship automatically;
 * info/debug ship only for curated event names (see CURATED_EVENTS, registered
 * via trackTelemetry). Control-flow logs stay local to the console.
 *
 * Dev: auto-enabled when NODE_ENV !== "production" (env-overridable). Prod: opt-in via TELEMETRY_* env vars, gated by server-injected global.
 */
import { getLogger, } from "./logger";
import { CURATED_EVENTS, TelemetryTransport, } from "./transports/telemetry";

let _initialized = false;

export function initTelemetry(): void {
  if (_initialized) { return; }
  _initialized = true;

  if (!isTelemetryEnabled()) { return; }

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

  trackPageView();
  globalThis.addEventListener("popstate", () => trackPageView(),);

  // Captures htmx-driven navigation; trackPageView dedupes to actual path
  // changes, so fragment swaps on the same path no longer emit page_views.
  document.addEventListener("htmx:afterSettle", () => trackPageView(),);

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

/**
 * Send a curated telemetry event. Registers the name on the transport's
 * allowlist so it passes the info/debug gate and ships, even though the shared
 * logger also carries unrelated control-flow logs.
 */
export function trackTelemetry(event: string, data?: Record<string, unknown>,): void {
  if (!isTelemetryEnabled()) { return; }
  CURATED_EVENTS.add(event,);
  try {
    getLogger().info(event, data ?? {},);
  } catch {
    /* logger not ready */
  }
}

// ── page_view — deduped by pathname, debounced over HX swaps ──

let lastPagePath: string | null = null;
let pageViewTimer: ReturnType<typeof setTimeout> | null = null;

function trackPageView(): void {
  const path = location.pathname;
  if (path === lastPagePath) { return; }
  if (pageViewTimer) {
    clearTimeout(pageViewTimer,);
    pageViewTimer = null;
  }
  pageViewTimer = setTimeout(() => {
    lastPagePath = path;
    try {
      getLogger().info("frontend.page_view", { path, },);
    } catch {
      /* noop */
    }
  }, 300,);
}
