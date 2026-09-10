// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser model engine handle types (BYOK local-models slice).
 *
 * Public surface of `alpine/local-engine.ts`, split out so the engine
 * stays under the strict file-size limit.
 *
 * @module alpine/local-engine-types
 */

/** Engine construction options. */
export interface LocalEngineOptions {
  /** Worker factory (test seam, receives the worker URL). Defaults to the compiled worker asset. */
  workerFactory?: (url: string,) => Worker;
  /** transformers.js CDN (test seam). */
  cdn?: string;
  /** wllama ESM CDN (test seam). */
  wllamaCdn?: string;
  /** wllama WASM runtime URL (test seam). */
  wllamaWasmUrl?: string;
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
   * @returns Engine device actually used (`webgpu` or `wasm`, prefixed by family).
   * @throws {LocalInferenceUnavailable} On unknown model, worker or load failure.
   *
   * A successful load marks the model ready, so later composer calls pass
   * the readiness gate without a downloader round-trip.
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
