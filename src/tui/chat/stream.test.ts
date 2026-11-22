// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";

import { dispatchFrame, openChatStream, type StreamCallbacks, streamText, } from "./stream";

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
