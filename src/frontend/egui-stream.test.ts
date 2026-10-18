// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for egui-stream.ts: the bridge-owned EventSource registry — URL
 * construction, one-source-per-chat replacement, relay of the four-event
 * server contract into the Rust sink, terminal-event teardown, and the
 * no-sink / no-op-close edges.
 *
 * Resource contract (parallel-safe): each test owns its fake EventSource
 * instances and the global sink key; afterEach closes every stream the tests
 * can have opened (chat ids `c1`/`c2`), clears the fake registry and restores
 * the globals captured at module load, so a failing assertion cannot leak an
 * open source or a fake sink into a sibling test or file.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { closeGenerationStream, type EguiStreamSink, openGenerationStream, } from "./egui-stream";

/** Every chat id this suite opens a stream for (closed in afterEach). */
const OPENED_CHAT_IDS = ["c1", "c2",];

/** One recorded fake source: listeners keyed by event type. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CONNECTING = 0;
  static readonly CLOSED = 2;
  closed = false;
  readyState = 0;
  readonly url: string;
  readonly listeners = new Map<string, Set<(event: MessageEvent,) => void>>();

  constructor(url: string,) {
    this.url = url;
    FakeEventSource.instances.push(this,);
  }

  addEventListener(type: string, listener: (event: MessageEvent,) => void,): void {
    const set = this.listeners.get(type,) ?? new Set<(event: MessageEvent,) => void>();
    set.add(listener,);
    this.listeners.set(type, set,);
  }

  close(): void {
    this.closed = true;
  }

  /** Fire a server event the way the browser would. */
  dispatch(type: string, data: string,): void {
    for (const listener of this.listeners.get(type,) ?? []) {
      listener({ data, } as MessageEvent,);
    }
  }
}

let sinkCalls: Array<{ method: string; chatId: string; payload: string }> = [];
const realSink = (globalThis as { loopLoreEguiStream?: unknown }).loopLoreEguiStream;
const realOpen = (globalThis as { openGenerationStream?: unknown }).openGenerationStream;
const realClose = (globalThis as { closeGenerationStream?: unknown }).closeGenerationStream;

/** Sink that records every relayed event. */
const recordingSink: EguiStreamSink = {
  onUpdate: (chatId, payload,) => void sinkCalls.push({ method: "onUpdate", chatId, payload, },),
  onToolCall: (chatId, payload,) => void sinkCalls.push({ method: "onToolCall", chatId, payload, },),
  onDone: (chatId,) => void sinkCalls.push({ method: "onDone", chatId, payload: "", },),
  onError: (chatId, payload,) => void sinkCalls.push({ method: "onError", chatId, payload, },),
};

function withSink(sink: EguiStreamSink | null,): void {
  (globalThis as { loopLoreEguiStream?: unknown }).loopLoreEguiStream = sink ?? undefined;
}

afterEach(() => {
  for (const chatId of OPENED_CHAT_IDS) {
    closeGenerationStream(chatId,);
  }

  FakeEventSource.instances = [];
  sinkCalls = [];
  (globalThis as { loopLoreEguiStream?: unknown }).loopLoreEguiStream = realSink;
  (globalThis as { openGenerationStream?: unknown }).openGenerationStream = realOpen;
  (globalThis as { closeGenerationStream?: unknown }).closeGenerationStream = realClose;
},);

describe("frontend/egui-stream", () => {
  test("open subscribes to the chat's generation stream", () => {
    withSink(recordingSink,);
    openGenerationStream("c1", { eventSource: FakeEventSource as unknown as typeof EventSource, },);
    expect(FakeEventSource.instances.length,).toBe(1,);
    expect(FakeEventSource.instances[0]!.url,).toBe("/api/v1/generation/stream/c1",);
    expect(FakeEventSource.instances[0]!.closed,).toBe(false,);
  });

  test("reopening the same chat closes the previous source", () => {
    withSink(recordingSink,);
    openGenerationStream("c1", { eventSource: FakeEventSource as unknown as typeof EventSource, },);
    openGenerationStream("c1", { eventSource: FakeEventSource as unknown as typeof EventSource, },);
    expect(FakeEventSource.instances.length,).toBe(2,);
    expect(FakeEventSource.instances[0]!.closed,).toBe(true,);
    expect(FakeEventSource.instances[1]!.closed,).toBe(false,);
  });

  test("each server event relays to the sink with the chat id", () => {
    withSink(recordingSink,);
    openGenerationStream("c1", { eventSource: FakeEventSource as unknown as typeof EventSource, },);
    const source = FakeEventSource.instances[0]!;
    source.dispatch("stream-update", "<p>hi</p>",);
    source.dispatch("tool_call", "roll",);
    source.dispatch("stream-done", "",);
    source.dispatch("stream-error", '{"error":"boom"}',);
    expect(sinkCalls,).toEqual([
      { method: "onUpdate", chatId: "c1", payload: "<p>hi</p>", },
      { method: "onToolCall", chatId: "c1", payload: "roll", },
      { method: "onDone", chatId: "c1", payload: "", },
      { method: "onError", chatId: "c1", payload: '{"error":"boom"}', },
    ],);
  });

  test("terminal events close the source — no browser reconnect replay", () => {
    withSink(recordingSink,);
    openGenerationStream("c1", { eventSource: FakeEventSource as unknown as typeof EventSource, },);
    FakeEventSource.instances[0]!.dispatch("stream-done", "",);
    expect(FakeEventSource.instances[0]!.closed,).toBe(true,);
  });

  test("stream-error also closes the source", () => {
    withSink(recordingSink,);
    openGenerationStream("c1", { eventSource: FakeEventSource as unknown as typeof EventSource, },);
    FakeEventSource.instances[0]!.dispatch("stream-error", "{}",);
    expect(FakeEventSource.instances[0]!.closed,).toBe(true,);
  });

  test("relay without the wasm sink mounted never throws", () => {
    withSink(null,);
    openGenerationStream("c1", { eventSource: FakeEventSource as unknown as typeof EventSource, },);
    expect(() => {
      FakeEventSource.instances[0]!.dispatch("stream-update", "x",);
      FakeEventSource.instances[0]!.dispatch("stream-error", "{}",);
    },).not.toThrow();
  });

  test("close of an unknown chat is a no-op", () => {
    expect(() => closeGenerationStream("nope",)).not.toThrow();
  });

  test("close closes and forgets the source", () => {
    withSink(recordingSink,);
    openGenerationStream("c1", { eventSource: FakeEventSource as unknown as typeof EventSource, },);
    closeGenerationStream("c1",);
    expect(FakeEventSource.instances[0]!.closed,).toBe(true,);
    // Reopening must not see the closed source as the current one.
    openGenerationStream("c1", { eventSource: FakeEventSource as unknown as typeof EventSource, },);
    expect(FakeEventSource.instances.length,).toBe(2,);
    expect(FakeEventSource.instances[1]!.closed,).toBe(false,);
  });

  test("a transient connection error never relays a terminal", () => {
    withSink(recordingSink,);
    openGenerationStream("c1", { eventSource: FakeEventSource as unknown as typeof EventSource, },);
    const source = FakeEventSource.instances[0]!;
    // The browser surfaces a dropped connection (it will reconnect and replay)
    // as `error` with readyState CONNECTING; that is NOT a terminal event.
    source.readyState = FakeEventSource.CONNECTING;
    source.dispatch("error", "",);
    expect(sinkCalls,).toEqual([],);
    expect(source.closed,).toBe(false,);
  });

  test("a closed source relays the terminal and tears down", () => {
    withSink(recordingSink,);
    openGenerationStream("c1", { eventSource: FakeEventSource as unknown as typeof EventSource, },);
    const source = FakeEventSource.instances[0]!;
    // A fatal failure (401/404, wrong content-type) lands here: readyState is
    // CLOSED and none of the four named events ever fires.
    source.readyState = FakeEventSource.CLOSED;
    source.dispatch("error", "",);
    expect(source.closed,).toBe(true,);
    expect(sinkCalls,).toEqual([{ method: "onError", chatId: "c1", payload: "stream closed", },],);
  });

  test("init exposes the globals the Rust side imports", () => {
    withSink(recordingSink,);
    expect(typeof (globalThis as { openGenerationStream?: unknown }).openGenerationStream,).toBe("function",);
    expect(typeof (globalThis as { closeGenerationStream?: unknown }).closeGenerationStream,).toBe("function",);
    // Closing a chat no stream was opened for is the same no-op the Rust
    // side relies on for unconditional teardown.
    expect(() => closeGenerationStream("c9",)).not.toThrow();
  });
});
