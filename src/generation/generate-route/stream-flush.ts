// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stream flush helpers for the SSE generation path.
 *
 * Chunk flush + render-index bookkeeping split from `stream-to-client.ts`
 * to keep it under the file-size guard. Behavior identical.
 */

import { activeGenerations, } from "../cancellation-manager";
import type { StreamBuffer, } from "../stream-buffer";

/**
 * Flush a chunk to the SSE controller. Returns the sequence number assigned
 * by the StreamBuffer (used as `lastRenderedChunkIndex`).
 * @param controller
 * @param buffer
 * @param chunk
 */
export function flushChunk(
  controller: ReadableStreamDefaultController,
  buffer: StreamBuffer,
  chunk: string,
): number {
  const seq = buffer.append("stream-update", chunk,);
  controller.enqueue(new TextEncoder().encode(chunk,),);
  return seq;
}

/**
 * Record that this SSE event reached the client. The active generation
 * carries `lastRenderedChunkIndex` so the cancel path can persist exactly
 * where the user-visible response was truncated.
 * @param attemptId
 * @param seq
 */
export function recordLastRendered(attemptId: string, seq: number,): void {
  const active = activeGenerations.get(attemptId,);
  if (active) { active.lastRenderedChunkIndex = seq; }
}
