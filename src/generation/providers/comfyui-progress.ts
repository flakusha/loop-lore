// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI WebSocket progress subscription. Informational only: completion
 * stays with the existing /history poll, so a dead socket cannot hang a run.
 */
import { jsonParseOr, } from "../../utils";

export interface ComfyUIProgressEvent {
  readonly promptId: string;
  readonly value: number;
  readonly max: number;
  readonly node?: string;
}

export interface ComfyUIProgressOptions {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly promptId: string;
  readonly onProgress: (event: ComfyUIProgressEvent,) => void;
  readonly timeoutMs?: number;
}

export interface ComfyUIProgressSubscription {
  close(): void;
}

/**
 * @param value - parsed JSON value
 * @returns whether the value is a non-null object
 */
function isRecord(value: unknown,): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Open a progress socket for one prompt. Events from other clients or prompts
 * are dropped; the socket closes on a sentinel, an error, or the timeout.
 * @param options - base url, client id, prompt id and progress callback
 * @returns a handle whose close() is safe to call more than once
 */
export function subscribeProgress(options: ComfyUIProgressOptions,): ComfyUIProgressSubscription {
  const url = new URL(options.baseUrl,);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "",)}/ws`;
  url.searchParams.set("clientId", options.clientId,);

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let socket: WebSocket | undefined;

  /** Idempotent teardown. */
  function close(): void {
    if (closed) { return; }
    closed = true;
    if (timer) { clearTimeout(timer,); }
    try {
      socket?.close();
    } catch {
      // Socket already gone — nothing to release.
    }
  }

  timer = setTimeout(close, options.timeoutMs ?? 30_000,);
  timer.unref?.();

  try {
    socket = new WebSocket(url.toString(),);
  } catch {
    close();
    return { close, };
  }

  socket.onmessage = (event: MessageEvent,) => {
    if (closed || typeof event.data !== "string") { return; }
    const message = jsonParseOr<unknown>(event.data, null,);

    if (!isRecord(message,) || !isRecord(message.data,)) { return; }
    if (message.data.prompt_id !== options.promptId) { return; }

    if (message.type === "progress" && typeof message.data.value === "number" && typeof message.data.max === "number") {
      options.onProgress({
        promptId: options.promptId,
        value: message.data.value,
        max: message.data.max,
        node: typeof message.data.node === "string" ? message.data.node : undefined,
      },);

      return;
    }

    if (message.type === "executing" && message.data.node === null) { close(); }
  };

  socket.onerror = () => close();
  socket.onclose = () => close();

  return { close, };
}
