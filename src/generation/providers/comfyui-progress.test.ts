// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { ComfyUIClient, } from "./comfyui";
import { type ComfyUIProgressEvent, subscribeProgress, } from "./comfyui-progress";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly url: string;
  closed = false;
  onmessage?: (event: { data: string },) => void;
  onerror?: () => void;
  onclose?: () => void;

  /** @param url - socket url */
  constructor(url: string,) {
    this.url = url;
    FakeWebSocket.instances.push(this,);
  }

  close(): void {
    this.closed = true;
    this.onclose?.();
  }

  /** @param payload - decoded ComfyUI socket message */
  emit(payload: unknown,): void {
    this.onmessage?.({ data: JSON.stringify(payload,), },);
  }
}

const originalWebSocket = globalThis.WebSocket;
const originalFetch = globalThis.fetch;

/** Per-test global reset — a leaked socket stub poisons sibling cases. */
beforeEach(() => {
  FakeWebSocket.instances = [];
  (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
},);

afterEach(() => {
  (globalThis as Record<string, unknown>).WebSocket = originalWebSocket;
  (globalThis as Record<string, unknown>).fetch = originalFetch;
},);

describe("ComfyUI progress socket", () => {
  test("routes only this prompt's events and closes on the sentinel", () => {
    const seen: ComfyUIProgressEvent[] = [];
    const sub = subscribeProgress({
      baseUrl: "http://127.0.0.1:8188",
      clientId: "client-a",
      promptId: "prompt-1",
      onProgress: (event,) => seen.push(event,),
      timeoutMs: 5_000,
    },);

    const socket = FakeWebSocket.instances[0]!;
    expect(socket.url,).toBe("ws://127.0.0.1:8188/ws?clientId=client-a",);

    socket.emit({ type: "progress", data: { prompt_id: "prompt-2", value: 1, max: 10, }, },);
    expect(seen,).toHaveLength(0,);

    socket.emit({ type: "progress", data: { prompt_id: "prompt-1", value: 3, max: 10, node: "KSampler", }, },);
    expect(seen,).toEqual([{
      promptId: "prompt-1",
      value: 3,
      max: 10,
      node: "KSampler",
    },],);

    socket.emit({ type: "executing", data: { prompt_id: "prompt-1", node: null, }, },);
    expect(socket.closed,).toBe(true,);
    sub.close();
    expect(socket.closed,).toBe(true,);
  });

  test("a socket constructor failure still lets /history polling complete", async () => {
    (globalThis as Record<string, unknown>).WebSocket = class {
      constructor() {
        throw new Error("no socket",);
      }
    };

    (globalThis as Record<string, unknown>).fetch = () =>
      Promise.resolve(Response.json({
        "prompt-1": {
          status: { status_str: "success", completed: true, },
          outputs: { "9": { images: [{ filename: "out.png", },], }, },
        },
      },),);

    const client = new ComfyUIClient({
      baseUrl: "http://127.0.0.1:8188",
      clientId: "client-b",
      timeout: 1_000,
      pollIntervalMs: 10,
    },);

    const files = await client.waitForFiles("prompt-1",);
    expect(files,).toEqual([{ kind: "image", file: { filename: "out.png", }, },],);
  });

  test("submitWorkflow sends client_id only when configured", async () => {
    let body: unknown;
    (globalThis as Record<string, unknown>).fetch = (_url: string, init: RequestInit,) => {
      body = JSON.parse(String(init.body,),) as unknown;
      return Promise.resolve(Response.json({ prompt_id: "prompt-1", },),);
    };

    const client = new ComfyUIClient({ baseUrl: "http://127.0.0.1:8188", clientId: "client-c", },);
    await client.submitWorkflow({ "3": { inputs: {}, class_type: "KSampler", }, },);
    expect(body,).toEqual({
      prompt: { "3": { inputs: {}, class_type: "KSampler", }, },
      client_id: "client-c",
    },);

    const plain = new ComfyUIClient({ baseUrl: "http://127.0.0.1:8188", },);
    await plain.submitWorkflow({ "3": { inputs: {}, class_type: "KSampler", }, },);
    expect(body,).toEqual({ prompt: { "3": { inputs: {}, class_type: "KSampler", }, }, },);
  });
});
