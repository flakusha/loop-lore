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
  let blobs: Blob[];
  let originalNavigator: unknown;

  beforeEach(() => {
    blobs = [];
    originalNavigator = globalThis.navigator;
    (globalThis as { navigator: unknown }).navigator = {
      sendBeacon: (_url: string, blob: Blob,): boolean => {
        blobs.push(blob,);
        return true;
      },
    };
  },);

  afterEach(() => {
    (globalThis as { navigator: unknown }).navigator = originalNavigator;
  },);

  /**
   * @param entry
   */
  async function ship(entry: LogEntry,): Promise<void> {
    await new TelemetryTransport(SENT_URL,).write(entry,);
  }

  /** */
  async function payloads(): Promise<string[]> {
    return Promise.all(blobs.map((b,) => b.text()),);
  }

  it("ships warn level automatically", async () => {
    await ship(makeEntry(30, "generation error via SSE",),);
    expect(blobs.length,).toBe(1,);
    expect(JSON.parse((await payloads())[0]!,).type,).toBe("generation error via SSE",);
  });

  it("ships error level automatically", async () => {
    await ship(makeEntry(40, "frontend.error",),);
    expect(blobs.length,).toBe(1,);
  });

  it("drops info-level control-flow logs", async () => {
    await ship(makeEntry(20, "sendMessage",),);
    await ship(makeEntry(20, "loadMessages",),);
    expect(blobs.length,).toBe(0,);
  });

  it("drops debug-level logs", async () => {
    await ship(makeEntry(10, "app.init",),);
    expect(blobs.length,).toBe(0,);
  });

  it("ships info events on the curated allowlist", async () => {
    await ship(makeEntry(20, "frontend.page_view",),);
    expect(blobs.length,).toBe(1,);
  });

  it("ships info events registered via curated set", async () => {
    const event = "generation.completed";
    CURATED_EVENTS.add(event,);
    try {
      await ship(makeEntry(20, event,),);
      expect(blobs.length,).toBe(1,);
      expect(JSON.parse((await payloads())[0]!,).type,).toBe(event,);
    } finally {
      CURATED_EVENTS.delete(event,);
    }
  });

  it("flattens meta.chatId to top-level payload.chatId", async () => {
    const entry = makeEntry(20, "frontend.page_view",);
    entry.meta = { chatId: "chat-42", path: "/views/chat", };
    await ship(entry,);
    const payload = JSON.parse((await payloads())[0]!,);
    expect(payload.chatId,).toBe("chat-42",);
    expect(payload.data.chatId,).toBeUndefined();
    expect(payload.data.path,).toBe("/views/chat",);
  });

  it("omits chatId key when meta lacks chatId", async () => {
    await ship(makeEntry(20, "frontend.page_view",),);
    const payload = JSON.parse((await payloads())[0]!,);
    expect(payload.chatId,).toBeUndefined();
  });

  it("caps events sent per session", async () => {
    const transport = new TelemetryTransport(SENT_URL,);
    for (let i = 0; i < MAX_EVENTS_PER_SESSION + 2; i++) {
      await transport.write(makeEntry(40, `event-${i}`,),);
    }
    expect(blobs.length,).toBe(MAX_EVENTS_PER_SESSION,);
  });
});
