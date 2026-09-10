// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * wllama execution worker (BYOK local-models slice).
 *
 * Compiled separately to `wllama-engine.worker.js` (see build-frontend.mjs) —
 * never part of the main-thread bundle. Lazy-loads `@wllama/wllama` from CDN
 * on first `load`, then runs GGUF models (llama.cpp, WebGPU with WASM
 * fallback) for model-backed prompt levels.
 *
 * Protocol matches `alpine/local-engine-protocol.ts` (`EngineRequest`/
 * `EngineResponse` shapes, duplicated here so the worker bundle stays
 * dependency-free). Self-contained by design: importing the main-thread
 * module would drag the engine singleton into the worker bundle.
 *
 * Every failure posts `{ kind: "error", id, message }` — the main thread
 * converts it to `LocalInferenceUnavailable` and falls back to the server.
 *
 * @module alpine/wllama-engine.worker
 */

/** Minimal wllama surface used here (dynamic `import(cdn)`). */
interface WllamaInstance {
  loadModelFromHF(
    source: { repo: string; file: string },
    params?: Record<string, unknown>,
  ): Promise<void>;
  createChatCompletion(
    opts: Record<string, unknown>,
  ): Promise<{ choices?: { message?: { content?: unknown } }[] }>;
  exit(): Promise<void>;
}

/** wllama ESM surface used here (dynamic `import(cdn)`). */
interface WllamaModule {
  Wllama: new (
    paths: Record<string, string>,
    config?: Record<string, unknown>,
  ) => WllamaInstance;
  LoggerWithoutDebug: Record<string, unknown>;
}

/** Worker scope (no DOM lib here — `self` is untyped by default). */
const scope = globalThis as unknown as {
  onmessage: ((event: { data: unknown },) => void) | null;
  postMessage: (message: unknown,) => void;
};

let wllama: WllamaInstance | null = null;
let loadedModel: string | null = null;

interface LoadRequest {
  kind: "load";
  id: number;
  model: string;
  device: string;
  cdn: string;
  modelSource?: { repo: string; file: string };
  wasmUrl?: string;
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
 * Normalize generate input to wllama chat messages.
 * @param input - Chat array or bare prompt string.
 * @returns Chat messages for createChatCompletion.
 */
function toMessages(input: unknown,): { role: string; content: string }[] {
  if (typeof input === "string") { return [{ role: "user", content: input, },]; }
  if (Array.isArray(input,)) {
    return input
      .filter((entry,): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map((entry,) => ({
        role: typeof entry.role === "string" ? entry.role : "user",
        content: typeof entry.content === "string" ? entry.content : "",
      }),);
  }
  return [{ role: "user", content: String(input ?? "",), },];
}

/**
 * Load a GGUF model via wllama, preferring WebGPU and falling back to WASM
 * (`n_gpu_layers: 0`) when GPU init fails.
 * @param request - Load request (GGUF source, device, CDN, WASM URL).
 * @returns Engine device actually used.
 */
async function loadModel(request: LoadRequest,): Promise<string> {
  if (!request.modelSource) {
    throw new Error("wllama load needs a GGUF modelSource (repo + file)",);
  }
  if (!request.wasmUrl) {
    throw new Error("wllama load needs a wasmUrl for the runtime",);
  }
  const cdnUrl: string = request.cdn;
  // Dynamic import is load-bearing here: the CDN URL is runtime-selected
  // (test seam + version bumps without rebuilds), and wllama must never be
  // statically bundled — it would add megabytes to the main-thread bundle
  // and download weights before the user opts in.
  const module = await import(cdnUrl) as unknown as WllamaModule;
  const progressCallback = (progress: unknown,): void => {
    const record = progress as Record<string, unknown>;
    if (typeof record.loaded === "number" && typeof record.total === "number") {
      scope.postMessage({ kind: "progress", loaded: record.loaded, total: record.total, },);
    }
  };
  const attempts = request.device === "webgpu" ? ["webgpu", "wasm",] : ["wasm",];
  let lastError: unknown = null;
  for (const device of attempts) {
    try {
      const instance = new module.Wllama(
        { default: request.wasmUrl, },
        { logger: module.LoggerWithoutDebug, },
      );
      await instance.loadModelFromHF(request.modelSource, {
        // Default params offload to WebGPU when available; zero layers
        // forces the CPU/WASM path (mirrors the transformers worker loop).
        ...(device === "wasm" ? { n_gpu_layers: 0, } : {}),
        progressCallback,
      },);
      wllama?.exit().catch(() => undefined,);
      wllama = instance;
      loadedModel = request.model;
      return device;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("wllama load failed",);
}

scope.onmessage = (event: { data: unknown },): void => {
  const message = event.data;
  if (!isRequest(message,)) { return; }
  const id = message.id;
  if (message.kind === "unload") {
    const active = wllama;
    wllama = null;
    loadedModel = null;
    if (active) {
      active.exit().then(
        () => {
          scope.postMessage({ kind: "unloaded", id, },);
        },
        () => {
          scope.postMessage({ kind: "unloaded", id, },);
        },
      );
      return;
    }
    scope.postMessage({ kind: "unloaded", id, },);
    return;
  }
  if (message.kind === "load") {
    if (loadedModel === message.model && wllama) {
      scope.postMessage({ kind: "ready", id, engine: "wllama-cached", },);
      return;
    }
    loadModel(message,).then(
      (engine,) => {
        scope.postMessage({ kind: "ready", id, engine: `wllama-${engine}`, },);
      },
      (error: unknown,) => {
        const detail = error instanceof Error ? error.message : "unknown load error";
        scope.postMessage({ kind: "error", id, message: `model load failed: ${detail}`, },);
      },
    );
    return;
  }
  if (!wllama) {
    scope.postMessage({ kind: "error", id, message: "no browser model loaded", },);
    return;
  }
  const active = wllama;
  const messages = toMessages(message.input,);
  const maxTokens = message.maxTokens;
  Promise.resolve()
    .then(() => active.createChatCompletion({ messages, max_tokens: maxTokens, },))
    .then(
      (output,) => {
        const text = output?.choices?.[0]?.message?.content ?? "";
        scope.postMessage({ kind: "generated", id, text, },);
      },
      (error: unknown,) => {
        const detail = error instanceof Error ? error.message : "unknown generate error";
        scope.postMessage({ kind: "error", id, message: `generation failed: ${detail}`, },);
      },
    );
};
