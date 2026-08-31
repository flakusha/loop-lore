// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { jsonError, } from "../../routes/http-utils";
import { safeJsonStringify, } from "../../utils";
import { parseIntOr, } from "../../utils/parse-number";
import { getBuffer, } from "../index";

/**
 * GET /api/generation/stream/:chatId
 *
 * HTMX SSE endpoint for streaming generation updates.
 * - Replays buffered events for reconnecting clients
 * - Subscribes to live events until generation completes or errors
 * - Sends keepalive pings every 15s
 * - Closes connection on done/error or 30s of idle (no buffer)
 * @param chatId
 * @param headers
 */
export function handleGenerationStream(chatId: string, headers?: Headers,): Response {
  if (!chatId) {
    return jsonError({ message: "chatId is required", status: 400, },);
  }

  // Parse Last-Event-ID for SSE reconnect
  const lastEventId = headers?.get("Last-Event-ID",);

  const replayFrom = lastEventId ? parseIntOr(lastEventId, 0,) : 0;

  let cleanup: (() => void) | undefined;

  const sseStream = new ReadableStream({
    async start(controller,) {
      const buffer = await waitForBuffer(chatId, 15_000,);
      if (!buffer) {
        controller.enqueue(new TextEncoder().encode("event: stream-error\ndata: No active generation\n\n",),);
        controller.close();
        return;
      }

      for (const event of buffer.replay(replayFrom,)) {
        const lines = event.html.split("\n",);
        const dataBlock = Array.from(lines, (l,) => `data: ${l}`,).join("\n",);
        controller.enqueue(new TextEncoder().encode(`event: ${event.type}\n${dataBlock}\n\n`,),);
      }

      if (buffer.isDone || buffer.hasError) {
        controller.close();
        return;
      }

      const unsubscribe = buffer.subscribe(
        (event,) => {
          try {
            const dataBlock = Array.from(
              event.html.split("\n",),
              (l,) => `data: ${l}`,
            ).join("\n",);
            controller.enqueue(new TextEncoder().encode(`event: ${event.type}\n${dataBlock}\n\n`,),);
          } catch {
            // Controller might be closed — ignore
          }
        },
        () => {
          try {
            controller.enqueue(new TextEncoder().encode("event: stream-done\ndata: {}\n\n",),);
            controller.close();
          } catch {
            // Ignore
          }
        },
        (error: unknown,) => {
          try {
            const payload = safeJsonStringify({ error: String(error,), },);
            controller.enqueue(
              new TextEncoder().encode(`event: stream-error\ndata: ${payload.ok ? payload.value : "{}"}\n\n`,),
            );
            controller.close();
          } catch {
            // Ignore
          }
        },
      );

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": keepalive\n\n",),);
        } catch {
          clearInterval(keepalive,);
        }
      }, 15_000,);

      cleanup = () => {
        clearInterval(keepalive,);
        unsubscribe();
      };
    },
    cancel() {
      cleanup?.();
    },
  },);

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  },);
}

/**
 * Wait up to `timeoutMs` for a StreamBuffer to appear for the given chat.
 * Returns null if timed out or no generation is active.
 * @param chatId
 * @param timeoutMs
 */
async function waitForBuffer(chatId: string, timeoutMs: number,): Promise<ReturnType<typeof getBuffer>> {
  // Buffer may already exist (created before LLM call starts)
  const existing = getBuffer(chatId,);
  if (existing) { return existing; }

  // Poll for buffer — don't check isChatGenerating because the generation
  // may have completed before the SSE client connects. The buffer lives
  // for 300s after completion, so we can still replay events.
  return new Promise((resolve,) => {
    const start = Date.now();
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        resolve(undefined,);
        return;
      }
      const buf = getBuffer(chatId,);
      if (buf) {
        resolve(buf,);
        return;
      }
      setTimeout(check, 200,);
    };
    check();
  },);
}
