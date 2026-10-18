// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * egui SSE stream bridge (browser side).
 *
 * reqwest has no EventSource (seanmonstar/reqwest#2677) and the wasm target
 * has no sockets, so EVERY stream the egui client consumes is owned here:
 * this module holds the EventSource per chat and relays the server's event
 * contract (`stream-update` / `tool_call` / `stream-done` / `stream-error`,
 * the same one `src/frontend/alpine/chat-generations.ts` listens for) into
 * the Rust sink at `window.loopLoreEguiStream`. Rust never speaks SSE; the
 * exported glue functions in `native/loop-lore-egui/src/stream.rs` are the
 * only entry point it has.
 *
 * Reconnect is the browser's own: an EventSource reconnects automatically and
 * the server's stream buffer replays from the buffer start (the endpoint
 * emits no `id:` lines, exactly as for the htmx consumer), and the Rust
 * reducer's replace semantics converge the replay.
 *
 * Bundled into `egui-bridge.js` (same single script the /egui host page
 * loads); imported by `egui-bridge.ts`, which calls `initEguiStream()`.
 */

/** Global the Rust glue sink is installed on (by the /egui host page). */
const STREAM_SINK_KEY = "loopLoreEguiStream";

/** The Rust side of the stream contract (glue named exports). */
export interface EguiStreamSink {
  onUpdate(chatId: string, html: string,): void;
  onToolCall(chatId: string, payload: string,): void;
  onDone(chatId: string,): void;
  onError(chatId: string, payload: string,): void;
}

export interface EguiStreamOptions {
  /** Injectable for tests; defaults to the ambient `EventSource`. */
  eventSource?: typeof EventSource;
}

/** One open EventSource per chat — the teardown registry. */
const openStreams = new Map<string, EventSource>();

/**
 * Read the Rust sink if the wasm glue has installed it yet. Read per event
 * (never cached at open time) so events that arrive before the glue resolves
 * are still delivered.
 * @returns the sink, or null when the wasm app is not mounted
 */
function streamSink(): EguiStreamSink | null {
  const candidate = (globalThis as Record<string, unknown>)[STREAM_SINK_KEY];
  if (candidate === undefined || candidate === null) { return null; }
  return candidate as EguiStreamSink;
}

/**
 * Open the generation stream for one chat, replacing any existing source for
 * the same chat (the htmx consumer's `connectGenerationSSE` does the same).
 * @param chatId chat whose stream to subscribe to
 * @param options injectable EventSource constructor (tests)
 */
export function openGenerationStream(
  chatId: string,
  { eventSource: EventSourceCtor = EventSource, }: EguiStreamOptions = {},
): void {
  closeGenerationStream(chatId,);
  const source = new EventSourceCtor(`/api/v1/generation/stream/${encodeURIComponent(chatId,)}`,);
  source.addEventListener("stream-update", (event: MessageEvent,) => {
    streamSink()?.onUpdate(chatId, event.data,);
  },);

  source.addEventListener("tool_call", (event: MessageEvent,) => {
    streamSink()?.onToolCall(chatId, event.data,);
  },);

  source.addEventListener("stream-done", () => {
    streamSink()?.onDone(chatId,);
    // The server closes the stream on a terminal event; without this the
    // browser reconnects and replays the whole buffer (htmx `_cleanupSSE`).
    closeGenerationStream(chatId,);
  },);

  source.addEventListener("stream-error", (event: MessageEvent,) => {
    streamSink()?.onError(chatId, event.data,);
    closeGenerationStream(chatId,);
  },);

  // A fatal failure (401/404, wrong content-type) never reaches the four
  // named events: the browser fires `error` and the source stays open until
  // closed, so without this the registry entry lingers and the status line
  // never updates. `CONNECTING` (0) is a recoverable reconnect — leave it.
  source.addEventListener("error", () => {
    if (source.readyState === EventSourceCtor.CLOSED) {
      closeGenerationStream(chatId,);
      streamSink()?.onError(chatId, "stream closed",);
    }
  },);

  openStreams.set(chatId, source,);
}

/**
 * Close one chat's stream. Unknown chats are a no-op, so teardown paths can
 * call it unconditionally.
 * @param chatId chat whose stream to close
 */
export function closeGenerationStream(chatId: string,): void {
  const source = openStreams.get(chatId,);
  if (source === undefined) { return; }
  source.close();
  openStreams.delete(chatId,);
}

/**
 * Expose open/close for the Rust side: the wasm app calls the globals
 * `openGenerationStream` / `closeGenerationStream` when the active chat
 * changes (boot, chat switch, back-to-htmx), which no TS caller observes.
 */
export function initEguiStream(): void {
  (globalThis as Record<string, unknown>).openGenerationStream = openGenerationStream;
  (globalThis as Record<string, unknown>).closeGenerationStream = closeGenerationStream;
}

initEguiStream();
