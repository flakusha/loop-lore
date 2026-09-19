// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TelemetryTransport — sends curated log entries to POST /api/telemetry/event.
 *
 * Not a full log passthrough. warn/error entries ship automatically (genuine
 * failure signals); info/debug entries ship only when the event name is an
 * explicitly curated telemetry event (see CURATED_EVENTS, registered via
 * `trackTelemetry`). This keeps app control-flow logs (sendMessage, loadMessages,
 * module init, chat.open, etc.) out of the telemetry stream.
 *
 * Uses fetch() with keepalive — the spec'd fire-and-forget equivalent of
 * sendBeacon that still sends a well-formed JSON body. (sendBeacon + Blob
 * arrives at the server with an empty/unparseable body in some
 * environments, 422ing on route validation.)
 */
import type { LogEntry, Transport, } from "../../../logger/types";
import { safeFetch, } from "../../../utils";

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

/** */
export class TelemetryTransport implements Transport {
  readonly name = "telemetry";
  private readonly url: string;
  private sent = 0;
  private capWarned = false;

  /**
   * @param url
   */
  constructor(url = "/api/telemetry/event",) {
    this.url = url;
  }

  /**
   * @param entry
   */
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

    // The ingest route (TelemetryEventBody) accepts ONLY a closed union of
    // typed events with server-derived identity — never sessionId/userId/
    // chatId keys. warn/error entries map onto the `frontend.error` shape
    // ({message, stackDigest}); curated info events ship their typed shape.
    // Anything else would 422 and burn the request.
    const payload = entry.level >= MIN_TELEMETRY_LEVEL
      ? {
        type: "frontend.error",
        data: {
          message: truncate(eventType, 256,),
          stackDigest: digest(eventType + "\u0000" + (entry.error ?? ""),),
        },
      }
      : {
        type: eventType,
        data: {
          ...entry.meta,
          level: LEVEL_MAP[entry.level] ?? "info",
        },
      };

    void safeFetch(this.url, {
      method: "POST",
      body: payload,
      keepalive: true,
      handle401: false,
      timeout: 10_000,
    },).catch(() => {
      /* unreachable defensive catch — safeFetch rejects only on programming error */
    },);

    return Promise.resolve();
  }

  /** */
  flush(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * @param value
 * @param max
 */
function truncate(value: string, max: number,): string {
  return value.length <= max ? value : value.slice(0, max,);
}

/** FNV-1a hex digest, 16 chars — a stable, non-identifying fingerprint. */
function digest(value: string,): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i,);
    hash = Math.imul(hash, 0x01000193,);
  }
  return (hash >>> 0).toString(16,).padStart(8, "0",).repeat(2,);
}
