// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for SSE stream flush helpers (chunk flush + render-index bookkeeping). */
import { afterEach, describe, expect, test, } from "bun:test";
import { activeGenerations, } from "../cancellation-manager";
import type { ActiveGeneration, } from "../cancellation-manager";
import { StreamBuffer, } from "../stream-buffer";
import { flushChunk, recordLastRendered, } from "./stream-flush";

afterEach(() => {
  activeGenerations.delete("attempt-1",);
},);

describe("flushChunk", () => {
  test("appends to the buffer and enqueues encoded bytes", () => {
    const buffer = new StreamBuffer();
    const chunks: Uint8Array[] = [];
    const controller = {
      enqueue: (c: Uint8Array,) => {
        chunks.push(c,);
      },
    } as unknown as ReadableStreamDefaultController;
    const seq = flushChunk(controller, buffer, "hello",);
    expect(seq,).toBe(0,);
    expect(new TextDecoder().decode(chunks[0],),).toBe("hello",);
    expect(flushChunk(controller, buffer, " world",),).toBe(1,);
  });
});

describe("recordLastRendered", () => {
  test("updates the index for a tracked attempt", () => {
    activeGenerations.set("attempt-1", {
      lastRenderedChunkIndex: -1,
    } as unknown as ActiveGeneration,);
    recordLastRendered("attempt-1", 7,);
    expect(activeGenerations.get("attempt-1",)?.lastRenderedChunkIndex,).toBe(7,);
  });

  test("ignores unknown attempt ids", () => {
    expect(() => recordLastRendered("nope", 3,)).not.toThrow();
  });
});
