// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";

import { until, } from "../test-support";
import { dispatchFrame, openChatStream, openSendStream, type StreamCallbacks, streamText, } from "./stream";
import { applyStreamRow, } from "./stream-row";
import type { ChatHost, } from "./types";

/** Bun augments fetch with `preconnect`; a plain stub needs this cast. */
function asFetch(respond: () => Promise<Response>,): typeof fetch {
  return respond as unknown as typeof fetch;
}

/** Collector with a promise that resolves on either terminal event. */
function collector(): StreamCallbacks & { updates: string[]; settled: Promise<string> } {
  const updates: string[] = [];
  const { promise, resolve, } = Promise.withResolvers<string>();
  return {
    updates,
    settled: promise,
    onUpdate(content,) {
      updates.push(content,);
    },
    onDone() {
      resolve("done",);
    },
    onError(message,) {
      resolve(`error: ${message}`,);
    },
  };
}

/** SSE Response from a list of raw frames. */
function sseResponse(frames: string[],): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller,) {
        for (const frame of frames) { controller.enqueue(encoder.encode(`${frame}\n\n`,),); }
        controller.close();
      },
    },),
    { status: 200, headers: { "Content-Type": "text/event-stream", }, },
  );
}

describe("streamText", () => {
  it("strips tags, decodes entities and keeps block boundaries", () => {
    expect(
      streamText("<p>Hello &amp; &lt;world&gt; &quot;q&quot;</p><br>next",),
    ).toBe('Hello & <world> "q"\n\nnext',);
  });
});

describe("dispatchFrame", () => {
  it("routes update and terminal frames", () => {
    const cb = collector();
    expect(dispatchFrame("event: stream-update\ndata: <p>one</p>", cb,),).toBe(false,);
    expect(dispatchFrame(": keepalive", cb,),).toBe(false,);
    expect(dispatchFrame("event: stream-done\ndata: {}", cb,),).toBe(true,);
    expect(cb.updates,).toEqual(["one",],);
  });

  it("reports stream-error with its payload", () => {
    const cb = collector();
    expect(dispatchFrame("event: stream-error\ndata: boom", cb,),).toBe(true,);
    expect(cb.settled,).resolves.toBe("error: boom",);
  });
});

describe("openChatStream", () => {
  it("sends the bearer header and renders live update frames", async () => {
    let url = "";
    let headers: HeadersInit | undefined;
    const cb = collector();
    openChatStream({
      chatId: "chat/1",
      sessionToken: "tok",
      callbacks: cb,
      fetchFn: async (input, init,) => {
        url = String(input,);
        headers = init?.headers;
        return sseResponse([
          "event: stream-update\ndata: <p>first</p>",
          "event: stream-done\ndata: {}",
        ],);
      },
    },);

    expect(await cb.settled,).toBe("done",);
    expect(url,).toMatch(/\/api\/v1\/generation\/stream\/chat%2F1$/,);
    expect((headers as Record<string, string>).Authorization,).toBe("Bearer tok",);
    expect(cb.updates,).toEqual(["first",],);
  });

  it("falls back to onError on a non-ok response", async () => {
    const cb = collector();
    openChatStream({
      chatId: "chat-1",
      callbacks: cb,
      fetchFn: async () => new Response("nope", { status: 404, },),
    },);

    expect(await cb.settled,).toBe("error: HTTP 404",);
    expect(cb.updates,).toEqual([],);
  });

  it("reassembles a frame split across reads", async () => {
    const encoder = new TextEncoder();
    const cb = collector();
    const response = new Response(
      new ReadableStream({
        start(controller,) {
          controller.enqueue(encoder.encode("event: stream-update\ndata: par",),);
          controller.enqueue(encoder.encode("tial\n\n",),);
          controller.enqueue(encoder.encode("event: stream-done\ndata: {}\n\n",),);
          controller.close();
        },
      },),
      { status: 200, },
    );

    openChatStream({ chatId: "chat-1", callbacks: cb, fetchFn: async () => response, },);
    expect(await cb.settled,).toBe("done",);
    expect(cb.updates,).toEqual(["partial",],);
  });
});

describe("applyStreamRow", () => {
  it("appends one cyan-markup row and returns its index", () => {
    const lines = ["existing",];
    expect(applyStreamRow(null, lines, "hello",),).toBe(1,);
    expect(lines,).toEqual(["existing", "{cyan-fg}hello{/cyan-fg}",],);
  });

  it("escapes braces in streamed content", () => {
    const lines: string[] = [];
    applyStreamRow(null, lines, "a{b}c",);
    expect(lines,).toEqual(["{cyan-fg}a{open}b{close}c{/cyan-fg}",],);
  });

  it("replaces the live row in place when a new snapshot arrives", () => {
    const lines = ["before", "{cyan-fg}old{/cyan-fg}",];
    expect(applyStreamRow(1, lines, "new",),).toBe(1,);
    expect(lines,).toEqual(["before", "{cyan-fg}new{/cyan-fg}",],);
  });

  it("removes the live row on a null snapshot", () => {
    const lines = ["before", "{cyan-fg}old{/cyan-fg}",];
    expect(applyStreamRow(1, lines, null,),).toBeNull();
    expect(lines,).toEqual(["before",],);
  });

  it("leaves the transcript alone when there is no row to remove", () => {
    const lines = ["before",];
    expect(applyStreamRow(null, lines, null,),).toBeNull();
    expect(lines,).toEqual(["before",],);
  });
});

/** Minimal host surface openSendStream touches, plus assertion sinks. */
function streamHost(chatId: string | null,) {
  const state = { hidden: 0, streams: [] as (string | null)[], };
  const host = {
    chatId,
    sessionToken: "tok" as string | undefined,
    hideTyping() {
      state.hidden++;
    },
    setStreamContent(content: string | null,) {
      state.streams.push(content,);
    },
  } as unknown as ChatHost;

  return { host, state, };
}

describe("openSendStream", () => {
  it("opens no stream when the host has no active chat", () => {
    const { host, state, } = streamHost(null,);
    const sub = openSendStream(host,);
    expect(state.hidden,).toBe(0,);
    expect(state.streams,).toEqual([],);
    sub.close();
  });

  it("hides typing, renders tokens and clears the row on completion", async () => {
    const { host, state, } = streamHost("chat-1",);
    const originalFetch = globalThis.fetch;
    const frames = [
      "event: stream-update\ndata: <p>first</p>",
      "event: stream-done\ndata: {}",
    ];

    globalThis.fetch = asFetch(async () => sseResponse(frames,));
    try {
      // openSendStream uses the fetch captured at module import; a fresh
      // instance binds the stub without leaking it to sibling suites.
      const fresh = await import(`./stream?open-send-${crypto.randomUUID()}`);
      const sub = fresh.openSendStream(host,);
      await until(() => state.streams.includes(null,));
      expect(state.hidden,).toBe(1,);
      expect(state.streams,).toEqual(["first", null,],);
      sub.close();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("clears the row when the stream fails", async () => {
    const { host, state, } = streamHost("chat-2",);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = asFetch(async () => new Response("nope", { status: 500, },));
    try {
      const fresh = await import(`./stream?open-send-err-${crypto.randomUUID()}`);
      const sub = fresh.openSendStream(host,);
      await until(() => state.streams.includes(null,));
      expect(state.streams,).toEqual([null,],);
      sub.close();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
