// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tunnel wire protocol v1 (JSON frames over WebSocket).
 *
 * - out: `{ type: "complete", id, prompt, params }`
 * - in:  `{ type: "token", id, text } … { type: "done", id, text }`
 * - in:  `{ type: "error", id, message }`
 * A conforming tunnel proxy translates these to llama.cpp's HTTP
 * `/completion` (streaming) API. All JSON goes through the safe
 * utils — malformed frames decode to null and are ignored.
 *
 * @module alpine/tunnel-protocol
 */
import { safeJsonParse, safeJsonStringify, } from "../../utils/safe-json";

/** Sampling params forwarded to the tunnel server. */
export interface TunnelParams {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
}

/** Decoded inbound frame. */
export type TunnelFrame =
  | { kind: "token"; id: number; text: string }
  | { kind: "done"; id: number; text: string }
  | { kind: "error"; id: number; message: string };

/** Base backoff step (ms); attempt n waits `BASE * 2^(n-1)` capped. */
export const RECONNECT_BASE_MS = 500;

/** Backoff ceiling (ms). */
export const RECONNECT_CAP_MS = 30_000;

/**
 * Delay before reconnect attempt n (1-based).
 * @param attempt - 1-based attempt number.
 * @returns Capped exponential delay in ms.
 */
export function reconnectDelayMs(attempt: number,): number {
  return Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_CAP_MS,);
}

/**
 * Derive the HTTP(S) base for `/health` from a ws(s) URL.
 * @param url - Tunnel WebSocket URL.
 * @returns HTTP(S) origin + path base, or null when unparseable.
 */
export function httpBaseFromWs(url: string,): string | null {
  const match = /^(wss?):\/\/(.+)$/.exec(url,);
  if (!match) { return null; }
  return `${match[1] === "wss" ? "https" : "http"}://${match[2]}`;
}

/**
 * Encode an outbound completion frame.
 * @param id - Request id.
 * @param prompt - Prompt text.
 * @param params - Sampling params.
 * @returns Serialized frame, or null when unserializable.
 */
export function encodeCompleteFrame(
  id: number,
  prompt: string,
  params: TunnelParams | undefined,
): string | null {
  const result = safeJsonStringify({ type: "complete", id, prompt, params: params ?? {}, },);
  return result.ok ? result.value : null;
}

/**
 * Decode an inbound frame; malformed input yields null.
 * @param data - Raw frame payload.
 * @returns Decoded frame, or null to ignore.
 */
export function decodeFrame(data: unknown,): TunnelFrame | null {
  if (typeof data !== "string") { return null; }
  const parsed = safeJsonParse<unknown>(data,);
  if (!parsed.ok) { return null; }
  const frame = parsed.value;
  if (!frame || typeof frame !== "object" || !("type" in frame && "id" in frame)) { return null; }
  const id = frame.id;
  if (typeof id !== "number") { return null; }
  const type = frame.type;
  if ((type === "token" || type === "done") && "text" in frame && typeof frame.text === "string") {
    return { kind: type, id, text: frame.text, };
  }
  if (type === "error" && "message" in frame && typeof frame.message === "string") {
    return { kind: "error", id, message: frame.message, };
  }
  return null;
}

/**
 * Probe llama.cpp's `/health` endpoint.
 * @param url - Tunnel WebSocket URL.
 * @param fetchImpl - Fetch implementation.
 * @returns True on any 2xx; false otherwise.
 */
export async function probeTunnelHealth(
  url: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const base = httpBaseFromWs(url,);
  if (!base) { return false; }
  try {
    const res = await fetchImpl(`${base}/health`,);
    return res.ok;
  } catch {
    return false;
  }
}
