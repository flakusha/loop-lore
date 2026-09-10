// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * llama.cpp tunnel connector — WebSocket client for a user-run local
 * inference server (BYOK local-models "tunnel" mode).
 *
 * The connector never talks to the Loop Lore server — prompts stay on
 * the player's machine. Drops schedule reconnects with capped
 * exponential backoff; after `maxAttempts` the connector reports
 * `"failed"` and throws {@link TunnelUnavailable} so callers fall back
 * to the server provider — same pattern as local inference.
 * Frames: see `./tunnel-protocol`.
 *
 * @module alpine/tunnel-connector
 */
import {
  decodeFrame,
  encodeCompleteFrame,
  probeTunnelHealth,
  reconnectDelayMs,
  type TunnelParams,
} from "./tunnel-protocol";

/** Connection lifecycle state. */
export type TunnelStatus = "closed" | "connecting" | "open" | "reconnecting" | "failed";

/** Minimal socket surface (real WebSocket satisfies this). */
export interface TunnelSocket {
  send(data: string,): void;
  close(): void;
  onopen: ((event: unknown,) => void) | null;
  onmessage: ((event: { data: unknown },) => void) | null;
  onclose: ((event: unknown,) => void) | null;
  onerror: ((event: unknown,) => void) | null;
}

/** Injectable seams for tests. */
export interface TunnelConnectorDeps {
  openSocket?: (url: string,) => TunnelSocket;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number,) => Promise<void>;
  maxAttempts?: number;
  onStatus?: (status: TunnelStatus,) => void;
}

/** Thrown when the tunnel cannot serve — callers fall back to server. */
export class TunnelUnavailable extends Error {
  constructor(reason = "tunnel unavailable",) {
    super(reason,);
    this.name = "TunnelUnavailable";
  }
}

/**
 * Create a tunnel connector (starts closed; call `connect()`).
 * @param url - Tunnel WebSocket URL (e.g. `ws://localhost:8080/tunnel`).
 * @param deps - Injectable seams.
 */
export function createTunnelConnector(url: string, deps: TunnelConnectorDeps = {},): {
  status: TunnelStatus;
  connect(): Promise<void>;
  disconnect(): void;
  health(): Promise<boolean>;
  complete(prompt: string, params: TunnelParams | undefined, onToken: (text: string,) => void,): Promise<string>;
} {
  const openSocket = deps.openSocket ??
    ((target: string,): TunnelSocket => new WebSocket(target,) as unknown as TunnelSocket);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number,): Promise<void> => new Promise((resolve,) => setTimeout(resolve, ms,)));
  const maxAttempts = deps.maxAttempts ?? 5;
  const emit = deps.onStatus ?? ((): void => undefined);

  let status: TunnelStatus = "closed";
  let socket: TunnelSocket | null = null;
  let attempts = 0;
  let connecting: Promise<void> | null = null;
  let requestSeq = 0;
  const pending = new Map<number, {
    onToken: (text: string,) => void;
    resolve: (text: string,) => void;
    reject: (cause: Error,) => void;
  }>();

  const api = {
    get status(): TunnelStatus {
      return status;
    },
    connect,
    disconnect,
    health,
    complete,
  };
  return api;

  /**
   * Track and emit status.
   * @param next
   */
  function setStatus(next: TunnelStatus,): void {
    status = next;
    emit(next,);
  }

  /** Open (or re-open) the socket; resolves on open. */
  function connect(): Promise<void> {
    connecting ??= new Promise<void>((resolve, reject,): void => {
      setStatus(attempts === 0 ? "connecting" : "reconnecting",);
      let settled = false;
      try {
        socket = openSocket(url,);
      } catch (cause) {
        connecting = null;
        const detail = cause instanceof Error ? cause.message : String(cause,);
        reject(new TunnelUnavailable(`tunnel open failed: ${detail}`,),);
        return;
      }
      socket.onopen = (): void => {
        settled = true;
        attempts = 0;
        setStatus("open",);
        connecting = null;
        resolve();
      };
      socket.onmessage = (event,): void => {
        handleFrame(event.data,);
      };
      const fail = (): void => {
        if (settled) {
          void scheduleReconnect();
          return;
        }
        settled = true;
        connecting = null;
        if (attempts > 0) {
          /* Reconnect attempt dropped - keep backing off toward the cap. */
          reject(new TunnelUnavailable("tunnel reconnect failed",),);
          void scheduleReconnect();
          return;
        }
        setStatus("closed",);
        reject(new TunnelUnavailable("tunnel connection failed",),);
      };
      socket.onclose = fail;
      socket.onerror = fail;
    },);
    return connecting;
  }

  /**
   * Close the socket and stop reconnecting.
   */
  function disconnect(): void {
    attempts = maxAttempts;
    try {
      socket?.close();
    } catch {
      /* already gone */
    }
    socket = null;
    connecting = null;
    for (const [, request,] of pending) {
      request.reject(new TunnelUnavailable("tunnel disconnected",),);
    }
    pending.clear();
    setStatus("closed",);
  }

  /** Delegate liveness to the wire module. */
  function health(): Promise<boolean> {
    return probeTunnelHealth(url, fetchImpl,);
  }

  /**
   * Run a completion over the tunnel, streaming tokens.
   * @param prompt - Prompt text (never leaves the player's machine).
   * @param params - Sampling params.
   * @param onToken - Called per token chunk.
   * @returns Full generated text.
   * @throws {TunnelUnavailable} When closed, failed, or the server errors.
   */
  async function complete(
    prompt: string,
    params: TunnelParams | undefined,
    onToken: (text: string,) => void,
  ): Promise<string> {
    if (status !== "open" || !socket) {
      throw new TunnelUnavailable("tunnel is not connected",);
    }
    const id = (requestSeq += 1);
    const frame = encodeCompleteFrame(id, prompt, params,);
    if (!frame) {
      throw new TunnelUnavailable("tunnel send failed: unserializable prompt",);
    }
    const current = socket;
    const result = new Promise<string>((resolve, reject,): void => {
      pending.set(id, { onToken, resolve, reject, },);
    },);
    try {
      current.send(frame,);
    } catch (cause) {
      pending.delete(id,);
      throw new TunnelUnavailable(`tunnel send failed: ${String(cause,)}`,);
    }
    return result;
  }

  /**
   * Route an inbound frame to its pending request.
   * @param data - Raw frame payload.
   */
  function handleFrame(data: unknown,): void {
    const frame = decodeFrame(data,);
    if (!frame) { return; }
    const request = pending.get(frame.id,);
    if (!request) { return; }
    if (frame.kind === "token") {
      request.onToken(frame.text,);
      return;
    }
    pending.delete(frame.id,);
    if (frame.kind === "done") {
      request.resolve(frame.text,);
      return;
    }
    request.reject(new TunnelUnavailable(`tunnel error: ${frame.message}`,),);
  }

  /**
   * Wait out the backoff and re-open; fail pending requests at the cap.
   */
  async function scheduleReconnect(): Promise<void> {
    socket = null;
    if (attempts >= maxAttempts) {
      setStatus("failed",);
      for (const [, request,] of pending) {
        request.reject(new TunnelUnavailable("tunnel unreachable after retries",),);
      }
      pending.clear();
      return;
    }
    attempts += 1;
    setStatus("reconnecting",);
    await sleep(reconnectDelayMs(attempts,),);
    if (status === "closed") { return; }
    try {
      await connect();
    } catch {
      /* connect() already transitioned status; nothing to do */
    }
  }
}
