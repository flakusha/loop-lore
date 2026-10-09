// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeJsonStringify, } from "../utils/safe-json";

/** Callback used by a stream body to enqueue one SSE event. */
export type SseSend = (event: string, data: unknown,) => void;

/**
 * Build an SSE Response that polls on an interval and keeps the wire alive.
 * Shared scaffold for every server-sent-events route: owns the encoder,
 * the ReadableStream, the poll timer, the keepalive pings, the response
 * headers, and cleanup on cancel.
 * @param onTick called once immediately, then every intervalMs; a rejection
 *   is swallowed so a transient failure skips the beat but keeps the stream
 * @param opts
 * @param opts.intervalMs poll interval in ms
 * @param opts.keepaliveMs keepalive ping interval (must beat Bun.serve's
 *   10s idle timeout)
 * @param opts.onStart optional first-connect hook (e.g. initial snapshot
 *   with its own error reporting); runs before the first tick
 * @returns {Response} text/event-stream response
 */
export function sseStream(
  onTick: (send: SseSend,) => Promise<void>,
  opts: {
    intervalMs: number;
    keepaliveMs: number;
    onStart?: (send: SseSend,) => Promise<void>;
  },
): Response {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const send: SseSend = (event, data,) => {
    const controller = controllerRef;
    if (!controller) { return; }
    try {
      const payload = safeJsonStringify(data,);
      controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload.ok ? payload.value : "{}"}\n\n`,),);
    } catch {
      // controller closed — ignore
    }
  };

  const stream = new ReadableStream({
    start: (controller,) => {
      controllerRef = controller;
      if (opts.onStart) { void opts.onStart(send,); }
      onTick(send,).catch(() => {
        // a throwing first beat must not kill the stream or leak rejections
      },);

      timer = setInterval(() => {
        onTick(send,).catch(() => {
          // a throwing beat must not kill the stream or leak rejections
        },);
      }, opts.intervalMs,);

      keepalive = setInterval(() => send("ping", { t: Date.now(), },), opts.keepaliveMs,);
    },
    cancel: () => {
      if (timer) { clearInterval(timer,); }
      if (keepalive) { clearInterval(keepalive,); }
    },
  },);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  },);
}
