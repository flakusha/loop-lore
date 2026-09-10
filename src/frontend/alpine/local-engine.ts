// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser model execution engine (BYOK local-models slice).
 *
 * Spawns the compiled `local-engine.worker.js` Web Worker, which lazy-loads
 * transformers.js from CDN and runs small instruct models for model-backed
 * prompt levels. The worker bundle is never part of the main thread bundle;
 * nothing downloads until the user opts in AND downloads a model.
 *
 * Every failure mode throws {@link LocalInferenceUnavailable} — callers fall
 * back to the server. Local inference never blocks and never surfaces errors.
 *
 * @module alpine/local-engine
 */

import { BROWSER_MODEL_CATALOG, } from "../../inference/manifest";
import { ENGINE_WORKER_URL, isEngineResponse, TRANSFORMERS_CDN, } from "./local-engine-protocol";
import type { EngineRequest, EngineResponse, } from "./local-engine-protocol";
import { LocalInferenceUnavailable, } from "./local-inference";

/** Catalog id → transformers.js pipeline model id (quantized ONNX builds). */
const PIPELINE_MODEL_IDS: Record<string, string> = {
  "SmolLM2-360M-Instruct": "Xenova/SmolLM2-360M-Instruct",
  "Qwen2.5-0.5B-Instruct": "Xenova/Qwen2.5-0.5B-Instruct",
};

/** Engine construction options. */
export interface LocalEngineOptions {
  /** Worker factory (test seam). Defaults to the compiled worker asset. */
  workerFactory?: () => Worker;
  /** transformers.js CDN (test seam). */
  cdn?: string;
  /** Load timeout ms (default 5 min — first load downloads weights). */
  loadTimeoutMs?: number;
  /** Generate timeout ms (default 90 s). */
  generateTimeoutMs?: number;
}

/** Browser model engine handle. */
export interface LocalEngine {
  /**
   * Load a catalog model into the worker (no-op when already loaded).
   * @param modelId - Catalog model id.
   * @param onProgress - Weight-download progress (loaded, total) bytes.
   * @returns Engine device actually used (`webgpu` or `wasm`).
   * @throws {LocalInferenceUnavailable} On unknown model, worker or load failure.
   */
  loadModel(modelId: string, onProgress?: (loaded: number, total: number,) => void,): Promise<string>;
  /**
   * Run text generation on the loaded model.
   * @param input - Chat messages or prompt string.
   * @param maxTokens - Cap on new tokens (default 256).
   * @returns Raw `generated_text` payload.
   * @throws {LocalInferenceUnavailable} When no model is loaded or generation fails.
   */
  generate(input: unknown, maxTokens?: number,): Promise<unknown>;
  /** Loaded catalog model id, or null. */
  loadedModel(): string | null;
  /** Drop the worker; the next call recreates it. */
  terminate(): void;
}

interface Pending {
  resolve: (response: EngineResponse,) => void;
  reject: (error: Error,) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Create a browser model engine.
 * @param opts - Worker factory, CDN, and timeout overrides.
 * @returns Engine handle; worker spawns lazily on first use.
 */
export function createLocalEngine(opts: LocalEngineOptions = {},): LocalEngine {
  const cdn = opts.cdn ?? TRANSFORMERS_CDN;
  const loadTimeoutMs = opts.loadTimeoutMs ?? 300_000;
  const generateTimeoutMs = opts.generateTimeoutMs ?? 90_000;
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  let progressHandler: ((loaded: number, total: number,) => void) | null = null;
  let loaded: string | null = null;
  let engineName = "";

  function dropWorker(reason: string,): LocalInferenceUnavailable {
    const error = new LocalInferenceUnavailable(reason,);
    for (const [, entry,] of pending) {
      clearTimeout(entry.timer,);
      entry.reject(error,);
    }
    pending.clear();
    progressHandler = null;
    try {
      worker?.terminate();
    } catch {
      /* already gone */
    }
    worker = null;
    loaded = null;
    engineName = "";
    return error;
  }

  function ensureWorker(): Worker {
    if (worker) { return worker; }
    try {
      const created = opts.workerFactory ? opts.workerFactory() : new Worker(ENGINE_WORKER_URL,);
      created.onmessage = (event: MessageEvent,) => {
        const data: unknown = event.data;
        if (!isEngineResponse(data,)) { return; }
        if (data.kind === "progress") {
          progressHandler?.(data.loaded, data.total,);
          return;
        }
        const entry = data.id === undefined ? undefined : pending.get(data.id,);
        if (!entry) { return; }
        pending.delete(data.id as number,);
        clearTimeout(entry.timer,);
        if (data.kind === "error") { entry.reject(new LocalInferenceUnavailable(data.message,),); }
        else { entry.resolve(data,); }
      };
      created.onerror = () => {
        dropWorker("inference worker errored",);
      };
      worker = created;
      return created;
    } catch {
      throw new LocalInferenceUnavailable("web workers unavailable",);
    }
  }

  function request(message: EngineRequest, timeoutMs: number, timeoutReason: string,): Promise<EngineResponse> {
    const live = ensureWorker();
    const { promise, resolve, reject, } = Promise.withResolvers<EngineResponse>();
    const timer = setTimeout(() => {
      pending.delete(message.id,);
      reject(dropWorker(timeoutReason,),);
    }, timeoutMs,);
    pending.set(message.id, { resolve, reject, timer, },);
    live.postMessage(message,);
    return promise;
  }

  return {
    async loadModel(modelId, onProgress?,): Promise<string> {
      const descriptor = BROWSER_MODEL_CATALOG.find((m,) => m.id === modelId);
      const pipelineId = PIPELINE_MODEL_IDS[modelId];
      if (!descriptor || !pipelineId) {
        throw new LocalInferenceUnavailable(`unknown browser model "${modelId}"`,);
      }
      if (loaded === modelId && worker) { return engineName; }
      const device = descriptor.engine === "transformers-wasm" ? "wasm" : "webgpu";
      const dtype = descriptor.quantization.startsWith("q4",) ? "q4" : "q8";
      progressHandler = onProgress ?? null;
      try {
        const response = await request(
          { kind: "load", id: nextId++, model: pipelineId, device, dtype, cdn, },
          loadTimeoutMs,
          `model "${modelId}" load timed out`,
        );
        if (response.kind !== "ready") {
          throw new LocalInferenceUnavailable(`unexpected load response "${response.kind}"`,);
        }
        loaded = modelId;
        engineName = response.engine;
        return engineName;
      } finally {
        progressHandler = null;
      }
    },

    async generate(input, maxTokens = 256,): Promise<unknown> {
      if (!worker || !loaded) {
        throw new LocalInferenceUnavailable("no browser model loaded",);
      }
      const response = await request(
        { kind: "generate", id: nextId++, input, maxTokens, },
        generateTimeoutMs,
        "model generation timed out",
      );
      if (response.kind !== "generated") {
        throw new LocalInferenceUnavailable(`unexpected generate response "${response.kind}"`,);
      }
      return response.text;
    },

    loadedModel(): string | null {
      return loaded;
    },

    terminate(): void {
      dropWorker("engine terminated",);
    },
  };
}

let singleton: LocalEngine | null = null;

/**
 * Shared engine instance (module singleton so the worker + weights load once).
 * Pass options to (re)create — used by tests to inject a fake worker.
 * @param opts - Creation options on first call or recreate.
 * @returns The shared engine.
 */
export function getLocalEngine(opts?: LocalEngineOptions,): LocalEngine {
  if (opts) {
    singleton?.terminate();
    singleton = null;
  }
  if (!singleton) { singleton = createLocalEngine(opts ?? {},); }
  return singleton;
}

/** Drop the shared instance (tests, opt-out). */
export function resetLocalEngine(): void {
  try {
    singleton?.terminate();
  } catch {
    /* already gone */
  }
  singleton = null;
}
