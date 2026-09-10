// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser model execution engine (BYOK local-models slice).
 *
 * Spawns the compiled engine Web Worker matching the catalog model's engine
 * family — `local-engine.worker.js` (transformers.js, ONNX) or
 * `wllama-engine.worker.js` (llama.cpp, GGUF) — which lazy-loads its SDK
 * from CDN and runs small models for model-backed prompt levels. Worker
 * bundles are never part of the main thread bundle; nothing downloads until
 * the user opts in AND downloads a model. Switching engine families drops
 * and recreates the worker (one backend per worker).
 *
 * Every failure mode throws {@link LocalInferenceUnavailable} — callers fall
 * back to the server. Local inference never blocks and never surfaces errors.
 *
 * @module alpine/local-engine
 */

import { BROWSER_MODEL_CATALOG, } from "../../inference/manifest";
import { buildLoadRequest, resolveEnginePlan, } from "./local-engine-load";
import {
  isEngineResponse,
  TRANSFORMERS_CDN,
  WLLAMA_CDN,
  WLLAMA_WASM_URL,
} from "./local-engine-protocol";
import type { EngineRequest, EngineResponse, } from "./local-engine-protocol";
import type { LocalEngine, LocalEngineOptions, } from "./local-engine-types";
import { LocalInferenceUnavailable, markModelReady, } from "./local-inference";
export type { LocalEngine, LocalEngineOptions, } from "./local-engine-types";

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
  const wllamaCdn = opts.wllamaCdn ?? WLLAMA_CDN;
  const wllamaWasmUrl = opts.wllamaWasmUrl ?? WLLAMA_WASM_URL;
  const loadTimeoutMs = opts.loadTimeoutMs ?? 300_000;
  const generateTimeoutMs = opts.generateTimeoutMs ?? 90_000;
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  let progressHandler: ((loaded: number, total: number,) => void) | null = null;
  let loaded: string | null = null;
  let loadedUrl: string | null = null;
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
    loadedUrl = null;
    engineName = "";
    return error;
  }

  function ensureWorker(url: string,): Worker {
    if (worker && loadedUrl === url) { return worker; }
    if (worker) {
      // Engine family switch — one backend per worker, recreate.
      try {
        worker.terminate();
      } catch {
        /* already gone */
      }
      worker = null;
      loaded = null;
      engineName = "";
    }
    try {
      const created = opts.workerFactory ? opts.workerFactory(url,) : new Worker(url,);
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
      loadedUrl = url;
      return created;
    } catch {
      throw new LocalInferenceUnavailable("web workers unavailable",);
    }
  }

  function request(
    message: EngineRequest,
    timeoutMs: number,
    timeoutReason: string,
    url: string,
  ): Promise<EngineResponse> {
    const live = ensureWorker(url,);
    const { promise, resolve, reject, } = Promise.withResolvers<EngineResponse>();
    const timer = setTimeout(() => {
      pending.delete(message.id,);
      reject(dropWorker(timeoutReason,),);
    }, timeoutMs,);
    pending.set(message.id, { resolve, reject, timer, },);
    try {
      live.postMessage(message,);
    } catch {
      pending.delete(message.id,);
      clearTimeout(timer,);
      throw dropWorker("inference worker rejected the request",);
    }
    return promise;
  }

  return {
    async loadModel(modelId, onProgress?,): Promise<string> {
      const descriptor = BROWSER_MODEL_CATALOG.find((m,) => m.id === modelId);
      if (!descriptor) {
        throw new LocalInferenceUnavailable(`unknown browser model "${modelId}"`,);
      }
      const plan = resolveEnginePlan(descriptor,);
      if (loaded === modelId && worker && loadedUrl === plan.workerUrl) { return engineName; }
      progressHandler = onProgress ?? null;
      try {
        const response = await request(
          buildLoadRequest(descriptor, modelId, plan, { cdn, wllamaCdn, wllamaWasmUrl, }, nextId++,),
          loadTimeoutMs,
          `model "${modelId}" load timed out`,
          plan.workerUrl,
        );
        if (response.kind !== "ready") {
          throw new LocalInferenceUnavailable(`unexpected load response "${response.kind}"`,);
        }
        loaded = modelId;
        engineName = response.engine;
        markModelReady(modelId,);
        return engineName;
      } finally {
        progressHandler = null;
      }
    },

    async generate(input, maxTokens = 256,): Promise<unknown> {
      if (!worker || !loaded || !loadedUrl) {
        throw new LocalInferenceUnavailable("no browser model loaded",);
      }
      const response = await request(
        { kind: "generate", id: nextId++, input, maxTokens, },
        generateTimeoutMs,
        "model generation timed out",
        loadedUrl,
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
