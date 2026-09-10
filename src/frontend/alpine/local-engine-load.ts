// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Load-plan helpers for the browser model engine (BYOK local-models slice).
 *
 * Pure mapping from catalog descriptor to worker URL, device, and load
 * message — extracted from `alpine/local-engine.ts` so the engine stays
 * under the strict file-size limit. Covered indirectly by the engine tests.
 *
 * @module alpine/local-engine-load
 */

import type { LocalModelDescriptor, } from "../../inference/manifest";
import { isWllamaEngine, } from "../../inference/manifest";
import type { EngineRequest, } from "./local-engine-protocol";
import { ENGINE_WORKER_URL, WLLAMA_ENGINE_WORKER_URL, } from "./local-engine-protocol";
import { LocalInferenceUnavailable, } from "./local-inference";

/** Catalog id → transformers.js pipeline model id (quantized ONNX builds). */
const PIPELINE_MODEL_IDS: Record<string, string> = {
  "SmolLM2-360M-Instruct": "Xenova/SmolLM2-360M-Instruct",
  "Qwen2.5-0.5B-Instruct": "Xenova/Qwen2.5-0.5B-Instruct",
};

/** Worker URL + device resolved from a catalog descriptor. */
export interface EngineLoadPlan {
  /** Compiled worker asset matching the descriptor's engine family. */
  workerUrl: string;
  /** Device requested from the worker (`webgpu` with WASM fallback). */
  device: string;
  /** True for wllama (GGUF) loads; false for transformers.js (ONNX). */
  wllama: boolean;
}

/**
 * Resolve the worker URL and device for a catalog descriptor.
 * @param descriptor - Catalog model descriptor.
 * @returns Load plan; WASM-only engines skip the WebGPU attempt.
 */
export function resolveEnginePlan(descriptor: LocalModelDescriptor,): EngineLoadPlan {
  const wllama = isWllamaEngine(descriptor.engine,);
  return {
    workerUrl: wllama ? WLLAMA_ENGINE_WORKER_URL : ENGINE_WORKER_URL,
    device: descriptor.engine === "transformers-wasm" || descriptor.engine === "wllama-wasm"
      ? "wasm"
      : "webgpu",
    wllama,
  };
}

/** CDN endpoints for a load request (engine default with test override). */
export interface LoadEndpoints {
  /** transformers.js ESM CDN. */
  cdn: string;
  /** wllama ESM CDN. */
  wllamaCdn: string;
  /** wllama WASM runtime URL. */
  wllamaWasmUrl: string;
}

/**
 * Build the worker load message for a catalog model.
 * @param descriptor - Catalog model descriptor.
 * @param modelId - Catalog model id (error text + pipeline lookup).
 * @param plan - Plan from {@link resolveEnginePlan}.
 * @param endpoints - CDN endpoints.
 * @param id - Request id.
 * @returns Load message for the worker matching the plan.
 * @throws {LocalInferenceUnavailable} On wllama entries without GGUF source or unknown pipeline ids.
 */
export function buildLoadRequest(
  descriptor: LocalModelDescriptor,
  modelId: string,
  plan: EngineLoadPlan,
  endpoints: LoadEndpoints,
  id: number,
): EngineRequest {
  if (plan.wllama) {
    if (!descriptor.gguf) {
      throw new LocalInferenceUnavailable(`wllama model "${modelId}" has no GGUF source`,);
    }
    return {
      kind: "load",
      id,
      model: modelId,
      device: plan.device,
      dtype: descriptor.quantization,
      cdn: endpoints.wllamaCdn,
      modelSource: descriptor.gguf,
      wasmUrl: endpoints.wllamaWasmUrl,
    };
  }
  const pipelineId = PIPELINE_MODEL_IDS[modelId];
  if (!pipelineId) {
    throw new LocalInferenceUnavailable(`unknown browser model "${modelId}"`,);
  }
  return {
    kind: "load",
    id,
    model: pipelineId,
    device: plan.device,
    dtype: descriptor.quantization.startsWith("q4",) ? "q4" : "q8",
    cdn: endpoints.cdn,
  };
}
