// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for `runPeerWorkload` — the sender-side client that POSTs a workload
 * to a peer and assembles the streamed reply.
 *
 * Every case injects a fake `PeerWorkTransport` so no socket is opened and the
 * chunk wire format is asserted exactly (newline-delimited, error envelopes
 * routed, truncation and malformed lines caught).
 */
import { describe, expect, test, } from "bun:test";
import type { ChunkEvent, } from "../generation/providers/types";
import { PEER_WORK_DEFAULT_TIMEOUT_MS, runPeerWorkload, } from "./peer-work-client";
import type { PeerWorkTransport, } from "./peer-work-client";
import type { PeerWorkRunRequest, } from "./peer-work-wire";

const PEER = { origin: "https://gpu.example", };

/** A minimal run request for the stub. */
const REQUEST: PeerWorkRunRequest = {
  workloadClass: "chat",
  assignmentKey: "assignment-key",
  provider: "stub-provider",
  model: "stub-model",
  messages: [{ role: "user", content: "hi", },],
};

/**
 * Build a newline-delimited JSON body as a `Response`, the shape the real
 * transport hands back in streaming mode.
 * @param lines Chunk lines or a single error-envelope object.
 * @param status
 * @returns {Response}
 */
function sseResponse(lines: unknown[], status = 200,): Response {
  const body = lines.map((line,) => JSON.stringify(line,)).join("\n",) + "\n";
  return new Response(body, { status, headers: { "content-type": "application/x-ndjson", }, },);
}

/**
 * A transport returning a canned response and capturing what it was asked.
 * @param response
 * @param sink
 * @returns {PeerWorkTransport}
 */
function fakeTransport(
  response: Response,
  sink: { url?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal } = {},
): PeerWorkTransport {
  return async (options,) => {
    sink.url = options.url;
    sink.headers = options.headers;
    sink.body = options.body;
    sink.signal = options.signal;
    return response;
  };
}

/** A content + done pair with usage, the minimal complete stream. */
function completeStream(content = "ok",): ChunkEvent[] {
  return [
    { type: "content", content, },
    {
      type: "done",
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: content.length, totalTokens: 1 + content.length, },
    },
  ];
}

describe("runPeerWorkload", () => {
  test("assembles a complete stream and reports the emitted count", async () => {
    const sink: { url?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal } = {};
    const chunks: ChunkEvent[] = [];
    const attempt = await runPeerWorkload({
      peer: PEER,
      request: REQUEST,
      bearer: "token-abc",
      transport: fakeTransport(
        sseResponse([
          { type: "content", content: "hello", },
          { type: "content", content: " world", },
          { type: "done", finishReason: "stop", usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3, }, },
        ],),
        sink,
      ),
      onChunk: (chunk,) => {
        chunks.push(chunk,);
      },
    },);

    expect(attempt.ok,).toBe(true,);
    if (!attempt.ok) { return; }
    expect(attempt.response.content,).toBe("hello world",);
    expect(attempt.response.finishReason,).toBe("stop",);
    expect(attempt.emitted,).toBe(3,);
    expect(chunks,).toHaveLength(3,);
    // The bearer reaches the transport as an Authorization header.
    expect(sink.headers?.authorization,).toBe("Bearer token-abc",);
    expect(sink.url,).toContain("/peer-work/run",);
  });

  test("sends the origin header but no bearer when none is supplied", async () => {
    const sink: { url?: string; headers?: Record<string, string>; body?: unknown; signal?: AbortSignal } = {};
    const attempt = await runPeerWorkload({
      peer: PEER,
      request: REQUEST,
      bearer: null,
      transport: fakeTransport(sseResponse(completeStream("x",),), sink,),
    },);

    expect(attempt.ok,).toBe(true,);
    expect(sink.headers?.authorization,).toBeUndefined();
  });

  test("a non-2xx error envelope routes the peer's own error code", async () => {
    const attempt = await runPeerWorkload({
      peer: PEER,
      request: REQUEST,
      bearer: null,
      transport: fakeTransport(sseResponse([
        { error: "peer says no", code: "FORBIDDEN", data: { error_code: "federation.workload_peer_untrusted", }, },
      ], 403,),),
    },);

    expect(attempt.ok,).toBe(false,);
    if (attempt.ok) { return; }
    expect(attempt.failure.code,).toBe("federation.workload_peer_untrusted",);
    expect(attempt.failure.status,).toBe(403,);
    expect(attempt.failure.message,).toContain("peer says no",);
  });

  test("a non-2xx without a peer error code falls back to transport", async () => {
    const attempt = await runPeerWorkload({
      peer: PEER,
      request: REQUEST,
      bearer: null,
      transport: fakeTransport(sseResponse([{ error: "plain failure", },], 500,),),
    },);

    expect(attempt.ok,).toBe(false,);
    if (attempt.ok) { return; }
    expect(attempt.failure.code,).toBe("transport",);
    expect(attempt.failure.status,).toBe(500,);
    expect(attempt.failure.message,).toContain("plain failure",);
  });

  test("an error chunk mid-stream ends the attempt as a transport failure", async () => {
    const chunks: ChunkEvent[] = [];
    const attempt = await runPeerWorkload({
      peer: PEER,
      request: REQUEST,
      bearer: null,
      transport: fakeTransport(sseResponse([
        { type: "content", content: "partial", },
        { type: "error", content: "peer blew up", },
      ],),),
      onChunk: (chunk,) => {
        chunks.push(chunk,);
      },
    },);

    expect(attempt.ok,).toBe(false,);
    if (attempt.ok) { return; }
    expect(attempt.failure.code,).toBe("transport",);
    expect(attempt.failure.message,).toContain("peer workload attempt failed",);
    expect(attempt.emitted,).toBe(1,);
    expect(chunks,).toHaveLength(1,);
  });

  test("a malformed chunk line is a protocol failure", async () => {
    const attempt = await runPeerWorkload({
      peer: PEER,
      request: REQUEST,
      bearer: null,
      transport: fakeTransport(sseResponse([{ type: "content", content: "ok", }, "not-json", { type: "done", },],),),
    },);

    expect(attempt.ok,).toBe(false,);
    if (attempt.ok) { return; }
    expect(attempt.failure.code,).toBe("protocol",);
    expect(attempt.failure.message,).toContain("malformed",);
  });

  test("a truncated stream (no trailing newline) is a protocol failure", async () => {
    const response = new Response(JSON.stringify({ type: "content", content: "dangling", },), {
      status: 200,
      headers: { "content-type": "application/x-ndjson", },
    },);

    const attempt = await runPeerWorkload({
      peer: PEER,
      request: REQUEST,
      bearer: null,
      transport: fakeTransport(response,),
    },);

    expect(attempt.ok,).toBe(false,);
    if (attempt.ok) { return; }
    expect(attempt.failure.code,).toBe("protocol",);
    expect(attempt.failure.message,).toContain("truncated",);
  });

  test("a transport throw is a transport failure, not a crash", async () => {
    const attempt = await runPeerWorkload({
      peer: PEER,
      request: REQUEST,
      bearer: null,
      transport: async () => {
        throw new Error("connection refused",);
      },
    },);

    expect(attempt.ok,).toBe(false,);
    if (attempt.ok) { return; }
    expect(attempt.failure.code,).toBe("transport",);
    expect(attempt.failure.message,).toContain("connection refused",);
  });

  test("a 200 with a null body is a protocol failure", async () => {
    const attempt = await runPeerWorkload({
      peer: PEER,
      request: REQUEST,
      bearer: null,
      transport: fakeTransport(new Response(null, { status: 200, },),),
    },);

    expect(attempt.ok,).toBe(false,);
    if (attempt.ok) { return; }
    expect(attempt.failure.code,).toBe("protocol",);
    expect(attempt.failure.message,).toContain("stream missing",);
  });

  test("the caller abort signal aborts the attempt as aborted", async () => {
    const sink: { signal?: AbortSignal } = {};
    const attempt = await runPeerWorkload({
      peer: PEER,
      request: REQUEST,
      bearer: null,
      transport: async (options,) => {
        sink.signal = options.signal;
        return await new Promise<Response>((_resolve, reject,) => {
          options.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError",),);
          }, { once: true, },);
        },);
      },
      signal: (() => {
        const controller = new AbortController();
        queueMicrotask(() => controller.abort());
        return controller.signal;
      })(),
    },);

    expect(attempt.ok,).toBe(false,);
    if (attempt.ok) { return; }
    expect(attempt.failure.code,).toBe("aborted",);
    expect(sink.signal?.aborted,).toBe(true,);
  });

  test("the default timeout is exported for callers", () => {
    expect(PEER_WORK_DEFAULT_TIMEOUT_MS,).toBeGreaterThan(0,);
  });

  test("the per-attempt timeout aborts the transport signal", async () => {
    const sink: { signal?: AbortSignal } = {};
    const attempt = await runPeerWorkload({
      peer: PEER,
      request: REQUEST,
      bearer: null,
      timeoutMs: 1,
      transport: async (options,) => {
        sink.signal = options.signal;
        return await new Promise<Response>((_resolve, reject,) => {
          options.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError",),);
          }, { once: true, },);
        },);
      },
    },);

    expect(attempt.ok,).toBe(false,);
    if (attempt.ok) { return; }
    expect(attempt.failure.code,).toBe("aborted",);
    expect(sink.signal?.aborted,).toBe(true,);
  });
});
