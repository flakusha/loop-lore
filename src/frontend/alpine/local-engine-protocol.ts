// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser model worker protocol (BYOK local-models slice).
 *
 * Owns the main-thread ↔ `local-engine.worker.js` message contract: request
 * and response shapes plus the defensive response guard. The worker bundle
 * duplicates these shapes structurally (never imports this module) so
 * transformers.js stays out of the main-thread bundle.
 *
 * @module alpine/local-engine-protocol
 */

/** CDN serving the transformers.js ESM bundle (lazy, never bundled). */
export const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@xenova/transformers@3/+esm";

/** Same-origin URL of the compiled inference worker (see build-frontend.mjs). */
export const ENGINE_WORKER_URL = "/local-engine.worker.js";

/** Main → worker requests. */
export type EngineRequest =
  | { kind: "load"; id: number; model: string; device: string; dtype: string; cdn: string }
  | { kind: "generate"; id: number; input: unknown; maxTokens: number }
  | { kind: "unload"; id: number };

/** Worker → main responses. `progress` carries no id — routed to the in-flight load. */
export type EngineResponse =
  | { kind: "ready"; id: number; engine: string }
  | { kind: "generated"; id: number; text: unknown }
  | { kind: "unloaded"; id: number }
  | { kind: "progress"; loaded: number; total: number }
  | { kind: "error"; id?: number; message: string };

/**
 * Narrow an incoming worker message (defensive: workers are untyped).
 * @param data - Raw `onmessage` payload.
 * @returns True for well-formed engine responses.
 */
export function isEngineResponse(data: unknown,): data is EngineResponse {
  if (!data || typeof data !== "object") { return false; }
  const kind = (data as Record<string, unknown>).kind;
  return kind === "ready" || kind === "generated" || kind === "unloaded" ||
    kind === "progress" || kind === "error";
}
