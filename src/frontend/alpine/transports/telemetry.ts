/**
 * TelemetryTransport — sends log entries to POST /api/telemetry/event.
 *
 * Uses navigator.sendBeacon for fire-and-forget delivery.
 * Falls back to fetch() with keepalive when sendBeacon unavailable.
 */
import type { LogEntry, Transport } from "../../../logger/types";
import { safeJsonStringify } from "../../../utils/safe-json";

const LEVEL_MAP: Record<number, string> = {
  10: "trace",
  20: "info",
  30: "warn",
  40: "error",
};

export class TelemetryTransport implements Transport {
  readonly name = "telemetry";
  private readonly url: string;

  constructor(url = "/api/telemetry/event") {
    this.url = url;
  }

  write(entry: LogEntry): Promise<void> {
    const eventType = typeof entry.message === "string" ? entry.message : "log";

    const data: Record<string, unknown> = {
      ...entry.meta,
      level: LEVEL_MAP[entry.level] ?? "info",
    };
    if (entry.module) data.module = entry.module;
    if (entry.error) data.error = entry.error;

    const payload = {
      type: eventType,
      sessionId: entry.sessionId,
      userId: entry.userId,
      data,
    };

    const body = safeJsonStringify(payload);
    if (!body.ok) return Promise.resolve();

    try {
      const blob = new Blob([body.value], { type: "application/json" });
      navigator.sendBeacon(this.url, blob);
    } catch {
      fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body.value,
        keepalive: true,
      }).catch(() => {});
    }

    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}
