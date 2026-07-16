/**
 * Frontend Telemetry Tracking
 *
 * Opt-in client-side event tracking via navigator.sendBeacon.
 *   track(type, data) → queue events → flush on page unload
 *   htmx lifecycle hooks → auto-track page views
 *   window.onerror → capture unhandled errors
 *
 * Enabled via TELEMETRY_FRONTEND_ENABLED env var.
 */

let enabled = false;
let queue: Array<{ type: string; data?: Record<string, unknown> }> = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

export function initTelemetry(isEnabled: boolean): void {
  enabled = isEnabled;
  if (!enabled) return;

  flushTimer = setInterval(flush, 10_000);

  document.addEventListener("htmx:afterSettle", () => {
    track("frontend.page_view", { path: window.location.pathname });
  });

  window.addEventListener("error", (event) => {
    track("frontend.error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    track("frontend.error", {
      message: event.reason?.message ?? String(event.reason),
      type: "unhandledrejection",
    });
  });
}

export function track(type: string, data?: Record<string, unknown>): void {
  if (!enabled) return;
  queue.push({ type, data });
  if (queue.length >= 10) flush();
}

function flush(): void {
  if (queue.length === 0) return;
  const batch = queue.splice(0);
  const payload = {
    events: batch,
    sessionId: getSessionId(),
  };
  navigator.sendBeacon("/api/telemetry/event", JSON.stringify(payload));
}

function getSessionId(): string {
  const key = "ll_telemetry_sid";
  let sid = sessionStorage.getItem(key);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(key, sid);
  }
  return sid;
}
