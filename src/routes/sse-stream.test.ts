// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { type SseSend, sseStream, } from "./sse-stream";

describe("sseStream", () => {
  test("emits the first tick event and keepalive pings", async () => {
    const tick: (send: SseSend,) => Promise<void> = async (send,) => {
      send("conditions", { weather: "rain", },);
    };

    const res = sseStream(tick, { intervalMs: 5, keepaliveMs: 5, },);
    expect(res.headers.get("Content-Type",),).toBe("text/event-stream",);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let seen = "";
    const deadline = Date.now() + 2_000;
    while (!seen.includes("event: ping",) && Date.now() < deadline) {
      const { value, done, } = await reader.read();
      if (done) { break; }
      seen += decoder.decode(value,);
    }

    await reader.cancel();
    expect(seen,).toContain("event: conditions",);
    expect(seen,).toContain('data: {"weather":"rain"}',);
    expect(seen,).toContain("event: ping",);
  });

  test("a throwing tick does not kill the stream", async () => {
    let calls = 0;
    const res = sseStream(async (send,) => {
      calls++;
      if (calls === 1) { throw new Error("transient",); }
      send("ok", {},);
    }, { intervalMs: 5, keepaliveMs: 5, },);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let seen = "";
    const deadline = Date.now() + 2_000;
    while (!seen.includes("event: ok",) && Date.now() < deadline) {
      const { value, done, } = await reader.read();
      if (done) { break; }
      seen += decoder.decode(value,);
    }

    await reader.cancel();
    expect(calls,).toBeGreaterThanOrEqual(2,);
    expect(seen,).toContain("event: ok",);
  });

  test("onStart runs before the first tick", async () => {
    const order: string[] = [];
    const res = sseStream(async () => {
      order.push("tick",);
    }, {
      intervalMs: 60_000,
      keepaliveMs: 60_000,
      onStart: async (send,) => {
        order.push("start",);
        send("initial", {},);
      },
    },);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const { value, } = await reader.read();
    const first = decoder.decode(value,);
    await reader.cancel();

    expect(order,).toEqual(["start", "tick",],);
    expect(first,).toContain("event: initial",);
  });
});
