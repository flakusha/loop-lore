// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser model execution worker (BYOK local-models slice).
 *
 * Compiled separately to `local-engine.worker.js` (see build-frontend.mjs) —
 * never part of the main-thread bundle. Lazy-loads transformers.js from CDN
 * on first `load`, then runs small instruct models for model-backed prompt
 * levels. Weights are cached by transformers.js (Cache API / IndexedDB).
 *
 * Protocol matches `alpine/local-engine-protocol.ts` (`EngineRequest`/`EngineResponse`
 * shapes, duplicated here so the worker bundle stays dependency-free).
 * Self-contained by design: importing the main-thread module would drag the
 * engine singleton into the worker bundle.
 *
 * Every failure posts `{ kind: "error", id, message }` — the main thread
 * converts it to `LocalInferenceUnavailable` and falls back to the server.
 *
 * @module alpine/local-engine.worker
 */

/** Minimal text-generation pipeline handle (transformers.js `pipeline()` result). */
interface TextGenerator {
  (input: unknown, opts?: Record<string, unknown>,): Promise<unknown>;
}

/** transformers.js ESM surface used here (dynamic `import(cdn)`). */
interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    opts?: Record<string, unknown>,
  ) => Promise<TextGenerator>;
}

/** Worker scope (no DOM lib here — `self` is untyped by default). */
const scope = globalThis as unknown as {
  onmessage: ((event: { data: unknown },) => void) | null;
  postMessage: (message: unknown,) => void;
};

let generator: TextGenerator | null = null;
let loadedModel: string | null = null;

interface LoadRequest {
  kind: "load";
  id: number;
  model: string;
  device: string;
  dtype: string;
  cdn: string;
}

interface GenerateRequest {
  kind: "generate";
  id: number;
  input: unknown;
  maxTokens: number;
}

/**
 * Narrow an incoming message to a known request shape.
 * @param data - Raw `onmessage` payload.
 * @returns True for load/generate/unload requests.
 */
function isRequest(data: unknown,): data is LoadRequest | GenerateRequest | { kind: "unload"; id: number } {
  if (!data || typeof data !== "object") { return false; }
  const kind = (data as Record<string, unknown>).kind;
  return kind === "load" || kind === "generate" || kind === "unload";
}

/**
 * Load a transformers.js pipeline, preferring the requested device and
 * falling back to WASM when WebGPU init fails.
 * @param request - Load request (model, device, dtype, CDN).
 * @returns Engine device actually used.
 */
async function loadPipeline(request: LoadRequest,): Promise<string> {
  const cdnUrl: string = request.cdn;
  // Dynamic import is load-bearing here: the CDN URL is runtime-selected
  // (test seam + version bumps without rebuilds), and transformers.js must
  // never be statically bundled — it would add hundreds of MB to the main
  // thread bundle and download weights before the user opts in.
  const module = await import(cdnUrl) as unknown as TransformersModule;
  const progressCallback = (progress: unknown,): void => {
    const record = progress as Record<string, unknown>;
    if (typeof record.loaded === "number" && typeof record.total === "number") {
      scope.postMessage({ kind: "progress", loaded: record.loaded, total: record.total, },);
    }
  };
  const baseOpts = {
    dtype: request.dtype,
    progress_callback: progressCallback,
  };
  const devices = request.device === "webgpu" ? ["webgpu", "wasm",] : ["wasm",];
  let lastError: unknown = null;
  for (const device of devices) {
    try {
      generator = await module.pipeline("text-generation", request.model, { ...baseOpts, device, },);
      loadedModel = request.model;
      return device;
    } catch (error) {
      lastError = error;
      generator = null;
    }
  }
  throw lastError ?? new Error("pipeline load failed",);
}

scope.onmessage = (event: { data: unknown },): void => {
  const message = event.data;
  if (!isRequest(message,)) { return; }
  const id = message.id;
  if (message.kind === "unload") {
    generator = null;
    loadedModel = null;
    scope.postMessage({ kind: "unloaded", id, },);
    return;
  }
  if (message.kind === "load") {
    if (loadedModel === message.model && generator) {
      scope.postMessage({ kind: "ready", id, engine: "transformers-cached", },);
      return;
    }
    loadPipeline(message,).then(
      (engine,) => {
        scope.postMessage({ kind: "ready", id, engine: `transformers-${engine}`, },);
      },
      (error: unknown,) => {
        const detail = error instanceof Error ? error.message : "unknown load error";
        scope.postMessage({ kind: "error", id, message: `model load failed: ${detail}`, },);
      },
    );
    return;
  }
  if (!generator) {
    scope.postMessage({ kind: "error", id, message: "no browser model loaded", },);
    return;
  }
  const active = generator;
  const input = message.input;
  const maxTokens = message.maxTokens;
  Promise.resolve()
    .then(() => active(input, { max_new_tokens: maxTokens, return_full_text: false, },))
    .then(
      (output,) => {
        scope.postMessage({ kind: "generated", id, text: output, },);
      },
      (error: unknown,) => {
        const detail = error instanceof Error ? error.message : "unknown generate error";
        scope.postMessage({ kind: "error", id, message: `generation failed: ${detail}`, },);
      },
    );
};
