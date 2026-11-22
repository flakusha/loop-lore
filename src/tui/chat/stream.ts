// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI generation stream — SSE over `fetch`.
 *
 * EventSource cannot carry `Authorization`, and the stream route is authorized
 * (src/generation/generation-routes/stream.ts), so the browser bridge's
 * `EventSource` pattern is not available here. This is the smallest client that
 * reads the SAME wire contract (`stream-update` / `tool_call` / `stream-done`
 * / `stream-error`) that the web and egui surfaces consume.
 *
 * Updates are HTML on the wire (the web puts event.data straight into a DOM
 * node); the TUI strips tags before rendering. Replay on reconnect is handled
 * by the server's StreamBuffer — this client has no id/reconnect state.
 */
import { API_BASE, } from "./api";
import type { ChatHost, } from "./types";

// Bound at import time: TUI unit tests replace globalThis.fetch with a queued
// stub for the POST under test; the stream must not consume that same queue.
const ambientFetch = globalThis.fetch;
const defaultFetch: StreamFetch = (input, init,) => ambientFetch(input, init,);

/** Callbacks the host supplies for one chat stream. */
export interface StreamCallbacks {
  /** One accumulated content snapshot, already converted to plain text. */
  onUpdate(content: string,): void;
  /** Terminal event: no more updates for this generation. */
  onDone(): void;
  /** Non-terminal failure: caller keeps its polling fallback. */
  onError(message: string,): void;
}

/** Injectable fetch seam (tests pass a Response-producing stub). */
export type StreamFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Options for {@link openChatStream}. */
export interface ChatStreamOptions {
  chatId: string;
  sessionToken?: string;
  callbacks: StreamCallbacks;
  /** Defaults to ambient fetch. */
  fetchFn?: StreamFetch;
}

/** Handle used to stop a stream when chat switches or the send settles. */
export interface ChatStreamSubscription {
  close(): void;
}

/**
 * Convert one wire payload to displayable text. Tags are dropped, block ends
 * become newlines, and the five entities the generation buffer emits are
 * decoded. `&amp;` is last so `&amp;lt;` does not turn into a tag opener.
 * @param html - raw `data:` payload from a stream-update frame
 * @returns plain text
 */
export function streamText(html: string,): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n",)
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n",)
    .replace(/<[^>]*>/g, "",)
    .replace(/&lt;/g, "<",)
    .replace(/&gt;/g, ">",)
    .replace(/&quot;/g, '"',)
    .replace(/&#39;/g, "'",)
    .replace(/&nbsp;/g, " ",)
    .replace(/&amp;/g, "&",)
    .trim();
}

/**
 * Dispatch one SSE frame. Comment/keepalive lines carry no event and are
 * ignored. Returns true on a terminal frame (`stream-done` / `stream-error`).
 * @param frame - raw frame text without its trailing blank line
 * @param callbacks - host sinks
 * @returns whether the stream ended
 */
export function dispatchFrame(frame: string, callbacks: StreamCallbacks,): boolean {
  let event = "";
  const data: string[] = [];
  for (const line of frame.replaceAll("\r\n", "\n",).split("\n",)) {
    if (line.startsWith(":",) || line === "") { continue; }
    if (line.startsWith("event:",)) {
      event = line.slice(6,).trim();
    } else if (line.startsWith("data:",)) {
      const value = line.slice(5,);
      data.push(value.startsWith(" ",) ? value.slice(1,) : value,);
    }
  }

  if (event === "stream-update") {
    callbacks.onUpdate(streamText(data.join("\n",),),);
    return false;
  }

  if (event === "stream-done") {
    callbacks.onDone();
    return true;
  }

  if (event === "stream-error") {
    callbacks.onError(data.join("\n",) || "generation stream error",);
    return true;
  }

  // tool_call and unknown events are display-only chrome the TUI does not
  // render; the token snapshots in stream-update already carry the prose.
  return false;
}

/**
 * Open the generation stream. Network failures are reported through
 * `callbacks.onError` — never thrown — so callers keep their polling fallback.
 * @param options - chat id, optional bearer token and host callbacks
 * @returns a subscription the caller closes when the send settles
 */
export function openChatStream(options: ChatStreamOptions,): ChatStreamSubscription {
  const { chatId, sessionToken, callbacks, fetchFn = defaultFetch, } = options;
  const abort = new AbortController();
  let closed = false;

  const close = (): void => {
    if (closed) { return; }
    closed = true;
    abort.abort();
  };

  void (async () => {
    try {
      const response = await fetchFn(
        `${API_BASE}/api/v1/generation/stream/${encodeURIComponent(chatId,)}`,
        {
          headers: {
            Accept: "text/event-stream",
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}`, } : {}),
          },
          signal: abort.signal,
        },
      );

      if (!response.ok || response.body === null) {
        callbacks.onError(`HTTP ${response.status}`,);
        close();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      while (!closed) {
        const { done, value, } = await reader.read();
        if (done) { break; }
        pending += decoder.decode(value, { stream: true, },).replaceAll("\r\n", "\n",);

        let split = pending.indexOf("\n\n",);
        while (split !== -1) {
          const frame = pending.slice(0, split,);
          pending = pending.slice(split + 2,);
          if (dispatchFrame(frame, callbacks,)) {
            close();
            return;
          }

          split = pending.indexOf("\n\n",);
        }
      }
    } catch (error: unknown) {
      if (!closed) {
        callbacks.onError(error instanceof Error ? error.message : String(error,),);
      }
    } finally {
      close();
    }
  })();

  return { close, };
}

/**
 * Subscribe to the active chat stream for a send. Stale chats are ignored,
 * the typing row yields to the first token, and every terminal event clears
 * the live row. No chat id means no stream to open.
 * @param host - chat widget host
 * @returns a subscription the send closes when it settles
 */
export function openSendStream(host: ChatHost,): ChatStreamSubscription {
  const chatId = host.chatId;
  if (!chatId) { return { close: () => undefined, }; }

  return openChatStream({
    chatId,
    sessionToken: host.sessionToken,
    callbacks: {
      onUpdate: (content,) => {
        if (host.chatId !== chatId) { return; }
        host.hideTyping();
        host.setStreamContent?.(content,);
      },
      onDone: () => {
        if (host.chatId === chatId) { host.setStreamContent?.(null,); }
      },
      onError: () => {
        if (host.chatId === chatId) { host.setStreamContent?.(null,); }
      },
    },
  },);
}
