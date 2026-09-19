import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { LogEntry, } from "../../../logger/types";
import {
  CURATED_EVENTS,
  MAX_EVENTS_PER_SESSION,
  TelemetryTransport,
} from "./telemetry";

const SENT_URL = "https://telemetry.test/event";

/**
 * @param level
 * @param message
 */
function makeEntry(level: number, message: string | Record<string, unknown>,): LogEntry {
  return { level, timestamp: 0, time: "t", message, };
}

describe("TelemetryTransport curated gate", () => {
  /** Serialized bodies captured from the primary fetch() path. */
  let bodies: string[];
  let originalFetch: unknown;

  beforeEach(() => {
    bodies = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, opts: { body?: BodyInit | null },) => {
      if (typeof opts.body === "string") { bodies.push(opts.body,); }
      return new Response("{}", { status: 200, },);
    }) as typeof fetch;
  },);

  afterEach(() => {
    globalThis.fetch = originalFetch as typeof fetch;
  },);

  /**
   * @param entry
   */
  async function ship(entry: LogEntry,): Promise<void> {
    await new TelemetryTransport(SENT_URL,).write(entry,);
  }

  /** */
  function payloads(): string[] {
    return bodies;
  }

  it("ships warn level as a typed frontend.error event", async () => {
    const entry = makeEntry(30, "generation error via SSE",);
    entry.error = "NotAllowedError: writeText";
    await ship(entry,);
    expect(bodies.length,).toBe(1,);
    const payload = JSON.parse(payloads()[0]!,);
    expect(payload.type,).toBe("frontend.error",);
    expect(payload.data.message,).toBe("generation error via SSE",);
    expect(payload.data.stackDigest.length,).toBeLessThanOrEqual(64,);
    expect(payload.data.stackDigest,).toMatch(/^[0-9a-f]+$/,);
  });

  it("omits server-derived identity keys from every payload", async () => {
    const warn = makeEntry(30, "frontend.error",);
    warn.sessionId = "sess-1";
    warn.userId = "user-1";
    await ship(warn,);
    await ship(makeEntry(20, "frontend.page_view",),);
    for (const raw of payloads()) {
      const payload = JSON.parse(raw,);
      expect(payload.sessionId,).toBeUndefined();
      expect(payload.userId,).toBeUndefined();
      expect(payload.chatId,).toBeUndefined();
    }
  });

  it("truncates oversized warn messages to the schema cap", async () => {
    await ship(makeEntry(40, "x".repeat(400,),),);
    const payload = JSON.parse(payloads()[0]!,);
    expect(payload.data.message.length,).toBe(256,);
  });

  it("produces a stable digest for identical failures", async () => {
    await ship(makeEntry(40, "same failure",),);
    await ship(makeEntry(40, "same failure",),);
    const a = JSON.parse(payloads()[0]!,).data.stackDigest;
    const b = JSON.parse(payloads()[1]!,).data.stackDigest;
    expect(a,).toBe(b,);
  });

  it("ships error level automatically", async () => {
    await ship(makeEntry(40, "frontend.error",),);
    expect(bodies.length,).toBe(1,);
  });

  it("drops info-level control-flow logs", async () => {
    await ship(makeEntry(20, "sendMessage",),);
    await ship(makeEntry(20, "loadMessages",),);
    expect(bodies.length,).toBe(0,);
  });

  it("drops debug-level logs", async () => {
    await ship(makeEntry(10, "app.init",),);
    expect(bodies.length,).toBe(0,);
  });

  it("ships info events on the curated allowlist", async () => {
    await ship(makeEntry(20, "frontend.page_view",),);
    expect(bodies.length,).toBe(1,);
  });

  it("ships info events registered via curated set", async () => {
    const event = "generation.completed";
    CURATED_EVENTS.add(event,);
    try {
      await ship(makeEntry(20, event,),);
      expect(bodies.length,).toBe(1,);
      expect(JSON.parse(payloads()[0]!,).type,).toBe(event,);
    } finally {
      CURATED_EVENTS.delete(event,);
    }
  });

  it("caps events sent per session", async () => {
    const transport = new TelemetryTransport(SENT_URL,);
    for (let i = 0; i < MAX_EVENTS_PER_SESSION + 2; i++) {
      await transport.write(makeEntry(40, `event-${i}`,),);
    }
    expect(bodies.length,).toBe(MAX_EVENTS_PER_SESSION,);
  });
});
