// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, test, } from "bun:test";
import { describeOrSkip, } from "../../../test-utils/isolate-only";
import { connectStoryStream, disconnectStoryStream, parseStoryStateFrame, storyStream, } from "./stream";
import type { StoryStreamHost, } from "./stream";

// ── Fake EventSource ──
type StreamListener = (event: { data?: string },) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CLOSED = 2;
  url: string;
  closed = false;
  readyState = 1;
  listeners = new Map<string, StreamListener[]>();
  constructor(url: string,) {
    this.url = url;
    FakeEventSource.instances.push(this,);
  }
  addEventListener(type: string, cb: StreamListener,) {
    const list = this.listeners.get(type,) ?? [];
    list.push(cb,);
    this.listeners.set(type, list,);
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
  emit(type: string, data = "",) {
    for (const cb of this.listeners.get(type,) ?? []) { cb({ data, },); }
  }
}

const globalState = globalThis as unknown as Record<string, unknown>;
const realEventSource = globalState.EventSource;

/**
 * @param refreshImpl
 * @returns {StoryStreamHost}
 */
function buildHost(refreshImpl?: () => Promise<void>,): StoryStreamHost & { refreshCalls: number } {
  let refreshCalls = 0;
  const host = {
    _worldId: "world-1",
    _storyStream: null,
    _storyStreamWorldId: null,
    refreshCalls: 0,
    async refresh(): Promise<void> {
      refreshCalls++;
      host.refreshCalls = refreshCalls;
      await refreshImpl?.();
    },
    _activeChatId: () => "chat-1",
  } as unknown as StoryStreamHost & { refreshCalls: number };

  return host;
}

// Install the fake before each test that needs EventSource.
/**
 * @returns {void}
 */
function stubEventSource(): void {
  FakeEventSource.instances = [];
  globalState.EventSource = FakeEventSource;
}

afterEach(() => {
  globalState.EventSource = realEventSource;
  FakeEventSource.instances = [];
},);

describeOrSkip("parseStoryStateFrame", () => {
  test("decodes a well-formed frame", () => {
    const frame = parseStoryStateFrame(JSON.stringify({
      worldStates: { count: 2, updatedAt: "2026-01-01", },
      npcStates: { count: 1, updatedAt: null, },
      locationStates: { count: 0, updatedAt: null, },
      quests: { count: 3, updatedAt: "2026-01-02", },
    },),);

    expect(frame.worldStates.count,).toBe(2,);
    expect(frame.quests.updatedAt,).toBe("2026-01-02",);
  });

  test("malformed JSON falls back to empty (no refresh storm)", () => {
    const frame = parseStoryStateFrame("{not json",);
    expect(frame.worldStates.count,).toBe(0,);
    expect(frame.quests.count,).toBe(0,);
  });
},);

describeOrSkip("connectStoryStream", () => {
  test("opens a stream against the world's story-stream endpoint", () => {
    stubEventSource();
    const host = buildHost();
    connectStoryStream(host,);
    expect(FakeEventSource.instances.length,).toBe(1,);
    expect(FakeEventSource.instances[0]?.url,).toBe("/api/v1/worlds/world-1/story-stream",);
  });

  test("no-ops without a world", () => {
    stubEventSource();
    const host = buildHost();
    host._worldId = null;
    connectStoryStream(host,);
    expect(FakeEventSource.instances.length,).toBe(0,);
    expect(host._storyStream,).toBeNull();
  });

  test("story-state event refreshes the component", async () => {
    stubEventSource();
    const host = buildHost();
    connectStoryStream(host,);
    FakeEventSource.instances[0]?.emit("story-state", "{}",);
    await new Promise((resolve,) => setTimeout(resolve, 0,));
    expect(host.refreshCalls,).toBe(1,);
  });

  test("stale-world frames are dropped", async () => {
    stubEventSource();
    const host = buildHost();
    connectStoryStream(host,);
    host._worldId = "world-2";
    FakeEventSource.instances[0]?.emit("story-state", "{}",);
    await new Promise((resolve,) => setTimeout(resolve, 0,));
    expect(host.refreshCalls,).toBe(0,);
  });

  test("re-connecting for the same world keeps the single stream open", () => {
    stubEventSource();
    const host = buildHost();
    connectStoryStream(host,);
    const first = FakeEventSource.instances[0]!;
    connectStoryStream(host,);
    // The server replays its snapshot on every subscribe, so a second
    // subscribe would feed that snapshot into another refresh — a loop.
    expect(first.closed,).toBe(false,);
    expect(FakeEventSource.instances.length,).toBe(1,);
    expect(host._storyStream?.url,).toBe("/api/v1/worlds/world-1/story-stream",);
  });

  test("a world change re-opens the stream", () => {
    stubEventSource();
    const host = buildHost();
    connectStoryStream(host,);
    const first = FakeEventSource.instances[0]!;
    host._worldId = "world-2";
    connectStoryStream(host,);
    expect(first.closed,).toBe(true,);
    expect(FakeEventSource.instances.length,).toBe(2,);
    expect(FakeEventSource.instances[1]?.url,).toBe("/api/v1/worlds/world-2/story-stream",);
  });

  test("disconnect closes the stream", () => {
    stubEventSource();
    const host = buildHost();
    connectStoryStream(host,);
    const source = FakeEventSource.instances[0]!;
    disconnectStoryStream(host,);
    expect(source.closed,).toBe(true,);
    expect(host._storyStream,).toBeNull();
  });
},);

describeOrSkip("storyStream mixin", () => {
  test("mixin methods delegate to the module connect/disconnect", () => {
    stubEventSource();
    const component = {
      _worldId: "world-1",
      _storyStream: null,
      _storyStreamWorldId: null,
      _activeChatId: () => "chat-1",
      refresh: async () => {},
      ...storyStream,
    } as unknown as StoryStreamHost & typeof storyStream;

    storyStream.connectStoryStream.call(component as never,);
    expect(FakeEventSource.instances.length,).toBe(1,);
    expect(FakeEventSource.instances[0]?.url,).toBe("/api/v1/worlds/world-1/story-stream",);
    const source = FakeEventSource.instances[0]!;
    storyStream.disconnectStoryStream.call(component as never,);
    expect(source.closed,).toBe(true,);
  });
},);
