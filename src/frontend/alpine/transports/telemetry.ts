/**
 * TelemetryTransport — sends curated log entries to POST /api/telemetry/event.
 *
 * Not a full log passthrough. warn/error entries ship automatically (genuine
 * failure signals); info/debug entries ship only when the event name is an
 * explicitly curated telemetry event (see CURATED_EVENTS, registered via
 * `trackTelemetry`). This keeps app control-flow logs (sendMessage, loadMessages,
 * module init, chat.open, etc.) out of the telemetry stream.
 *
 * Uses navigator.sendBeacon for fire-and-forget delivery.
 * Falls back to fetch() with keepalive when sendBeacon unavailable.
 */
import type { LogEntry, Transport, } from "../../../logger/types";
import { safeFetch, safeJsonStringify, } from "../../../utils";

const LEVEL_MAP: Record<number, string> = {
  10: "trace",
  20: "info",
  30: "warn",
  40: "error",
};

/** warn+ entries always ship as telemetry (failures/errors are meaningful). */
export const MIN_TELEMETRY_LEVEL = 30;

/**
 * Low-level (info/debug) event names that are deliberate, curated telemetry.
 * Anything else below MIN_TELEMETRY_LEVEL is dropped as control-flow chatter.
 */
export const CURATED_EVENTS: Set<string> = new Set<string>(["frontend.page_view",],);

/** Per-instance (per-session) cap, guarding against a future enqueue bug. */
export const MAX_EVENTS_PER_SESSION = 1000;

export class TelemetryTransport implements Transport {
  readonly name = "telemetry";
  private readonly url: string;
  private sent = 0;
  private capWarned = false;

  constructor(url = "/api/telemetry/event",) {
    this.url = url;
  }

  write(entry: LogEntry,): Promise<void> {
    const eventType = typeof entry.message === "string" ? entry.message : "log";

    // Curated gate: drop control-flow logs that aren't intentional telemetry.
    if (entry.level < MIN_TELEMETRY_LEVEL && !CURATED_EVENTS.has(eventType,)) {
      return Promise.resolve();
    }
    if (this.sent >= MAX_EVENTS_PER_SESSION) {
      if (!this.capWarned) {
        this.capWarned = true;
        console.warn("[telemetry] session event cap reached — dropping further events",);
      }
      return Promise.resolve();
    }
    this.sent += 1;

    const data: Record<string, unknown> = {
      ...entry.meta,
      level: LEVEL_MAP[entry.level] ?? "info",
    };
    if (entry.module) { data.module = entry.module; }
    if (entry.error) { data.error = entry.error; }

    const payload = {
      type: eventType,
      sessionId: entry.sessionId,
      userId: entry.userId,
      data,
    };

    const body = safeJsonStringify(payload,);
    if (!body.ok) { return Promise.resolve(); }

    try {
      const blob = new Blob([body.value,], { type: "application/json", },);
      navigator.sendBeacon(this.url, blob,);
    } catch {
      void safeFetch(this.url, {
        method: "POST",
        body: payload,
        keepalive: true,
        handle401: false,
        timeout: 10_000,
      },).catch(() => {
        /* fire-and-forget — beacon fallback failure is non-critical */
      },);
    }

    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}
