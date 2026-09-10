// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser model worker protocol (BYOK local-models slice).
 *
 * Owns the main-thread ↔ worker message contract shared by both engine
 * workers (`local-engine.worker.js` for transformers.js,
 * `wllama-engine.worker.js` for llama.cpp GGUF): request and response shapes
 * plus the defensive response guard. Worker bundles duplicate these shapes
 * structurally (never import this module) so engine SDKs stay out of the
 * main-thread bundle.
 *
 * @module alpine/local-engine-protocol
 */

/** CDN serving the transformers.js ESM bundle (lazy, never bundled). */
export const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@xenova/transformers@3/+esm";

/** CDN serving the wllama ESM bundle (lazy, never bundled). Pinned — bump deliberately. */
export const WLLAMA_CDN = "https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/esm/index.js";

/** Same-CDN wllama WASM runtime passed to the Wllama constructor. */
export const WLLAMA_WASM_URL = "https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/esm/wasm/wllama.wasm";

/** Same-origin URL of the compiled transformers.js worker (see build-frontend.mjs). */
export const ENGINE_WORKER_URL = "/local-engine.worker.js";

/** Same-origin URL of the compiled wllama worker (see build-frontend.mjs). */
export const WLLAMA_ENGINE_WORKER_URL = "/wllama-engine.worker.js";

/** GGUF source for wllama loads (repo + file for loadModelFromHF). */
export interface GgufModelSource {
  repo: string;
  file: string;
}

/** Main → worker requests. */
export type EngineRequest =
  | {
    kind: "load";
    id: number;
    model: string;
    device: string;
    dtype: string;
    cdn: string;
    /** Present on wllama loads; ignored by the transformers.js worker. */
    modelSource?: GgufModelSource;
    /** Present on wllama loads; ignored by the transformers.js worker. */
    wasmUrl?: string;
  }
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
