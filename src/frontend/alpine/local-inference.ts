// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Opt-in browser-side inference (BYOK local-models slice).
 *
 * Runs eligible auxiliary tasks locally so their prompts never reach the
 * server: `spellcheck` via a deterministic local cleanup (no model, no
 * network), heavier levels via a lazily-loaded browser model once
 * cached. Anything unavailable throws {@link LocalInferenceUnavailable} and
 * the caller falls back to the server — local inference never blocks.
 *
 * Opt-in flag lives in localStorage (`local-inference-optin`), default off.
 * @module alpine/local-inference
 */

/** localStorage key for the opt-in flag. Default: off. */
export const LOCAL_INFERENCE_OPTIN_KEY = "local-inference-optin";

/** Tasks eligible for browser-side inference (mirrors server manifest). */
export const ELIGIBLE_TASKS = ["prompt-improve", "prompt-analyze",] as const;

/** Task eligible for browser-side inference. */
export type LocalTask = (typeof ELIGIBLE_TASKS)[number];

/** Levels handled locally without a model download. */
export const LOCAL_ONLY_LEVELS = ["spellcheck",] as const;

/** Device capabilities relevant to local inference. */
export interface LocalInferenceSupport {
  webgpu: boolean;
  wasm: boolean;
  indexedDB: boolean;
}

/** Injectable environment for capability detection (test seam). */
export interface LocalInferenceEnv {
  gpu?: unknown;
  wasm?: unknown;
  indexedDB?: unknown;
}

/** Result of a locally-run inference task. */
export interface LocalInferenceResult {
  content: string;
  engine: "local-heuristics" | "transformers-webgpu" | "transformers-wasm" | "wllama-webgpu" | "wllama-wasm";
  local: true;
}

/**
 * Thrown when local inference cannot handle a request — callers MUST catch
 * and fall back to the server. Never surfaces to the user as an error.
 */
export class LocalInferenceUnavailable extends Error {
  constructor(reason = "local inference unavailable",) {
    super(reason,);
    this.name = "LocalInferenceUnavailable";
  }
}

/**
 * Whether the user opted into browser-side inference.
 * @returns True when the localStorage flag is "1".
 */
export function isLocalInferenceOptedIn(): boolean {
  try {
    return localStorage.getItem(LOCAL_INFERENCE_OPTIN_KEY,) === "1";
  } catch {
    return false;
  }
}

/**
 * Persist the opt-in flag.
 * @param optedIn - True to run eligible tasks locally.
 */
export function setLocalInferenceOptIn(optedIn: boolean,): void {
  try {
    localStorage.setItem(LOCAL_INFERENCE_OPTIN_KEY, optedIn ? "1" : "0",);
  } catch {
    /* storage unavailable — opt-in stays off */
  }
}
/**
 * localStorage key recording a successfully loaded model. The composer only
 * attempts local model inference for flagged models — never surprise
 * multi-hundred-MB downloads. Weights themselves are cached by transformers.js.
 * Set by explicit downloads (model manager UI) and by the engine itself on
 * first successful load; cleared when the user deletes the model.
 * @param modelId
 */
export function modelReadyKey(modelId: string,): string {
  return `local-inference-model:${modelId}`;
}

/**
 * Whether a model finished at least one successful load.
 * @param modelId
 */
export function isModelReady(modelId: string,): boolean {
  try {
    return localStorage.getItem(modelReadyKey(modelId,),) === "1";
  } catch {
    return false;
  }
}

/**
 * Persist a successful model load.
 * @param modelId
 */
export function markModelReady(modelId: string,): void {
  try {
    localStorage.setItem(modelReadyKey(modelId,), "1",);
  } catch {
    /* storage unavailable — model simply won't be reused */
  }
}

/**
 * Forget a model (used when the user deletes it).
 * @param modelId
 */
export function clearModelReady(modelId: string,): void {
  try {
    localStorage.removeItem(modelReadyKey(modelId,),);
  } catch {
    /* already forgotten */
  }
}

/**
 * Detect device support for local inference.
 * @param env - Injectable overrides; defaults to the live navigator.
 * @returns Capability flags; capable when WebGPU or WASM is present.
 */
export function detectLocalInferenceSupport(env?: LocalInferenceEnv,): LocalInferenceSupport {
  const nav = globalThis.navigator as Navigator & { gpu?: unknown } | undefined;
  const webgpu = env?.gpu !== undefined ? env.gpu !== null : nav?.gpu !== undefined;
  const wasm = env?.wasm !== undefined
    ? env.wasm !== null
    : typeof (globalThis as Record<string, unknown>).WebAssembly !== "undefined";
  const indexedDB = env?.indexedDB !== undefined
    ? env.indexedDB !== null
    : typeof (globalThis as Record<string, unknown>).indexedDB !== "undefined";
  return { webgpu, wasm, indexedDB, };
}

/**
 * Whether a task should run locally: opted in + eligible + capable device.
 * @param task - Task identifier.
 * @param opts - Opt-in and capability overrides (test seam).
 * @param opts.optedIn - Defaults to the stored flag.
 * @param opts.support - Defaults to live device detection.
 * @returns True when the caller should attempt local inference first.
 */
export function shouldOffloadTask(
  task: string,
  opts?: { optedIn?: boolean; support?: LocalInferenceSupport },
): task is LocalTask {
  if (!(ELIGIBLE_TASKS as readonly string[]).includes(task,)) { return false; }
  const optedIn = opts?.optedIn ?? isLocalInferenceOptedIn();
  if (!optedIn) { return false; }
  const support = opts?.support ?? detectLocalInferenceSupport();
  return support.webgpu || support.wasm;
}

/**
 * Deterministic local cleanup for `spellcheck`: collapse whitespace, fix
 * spacing before punctuation, trim. No model, no network.
 * @param text - Draft to clean.
 * @returns Cleaned draft (may equal input when already clean).
 */
export function cleanupDraftLocally(text: string,): string {
  return text
    .replace(/[ \t]+/g, " ",)
    .replace(/\s+([,.;:!?])/g, "$1",)
    .replace(/\n{3,}/g, "\n\n",)
    .split("\n",)
    .map((line,) => line.trim())
    .join("\n",)
    .trim();
}

/**
 * Run prompt improvement locally.
 * @param opts - Text and gradation level.
 * @param opts.text - Draft to improve.
 * @param opts.level - Gradation level; only local-only levels run today.
 * @returns Local result for local-only levels.
 * @throws {LocalInferenceUnavailable} For model-backed levels (server fallback).
 */
export function runLocalPromptImprove(opts: { text: string; level: string },): LocalInferenceResult {
  const { text, level, } = opts;
  if (!(LOCAL_ONLY_LEVELS as readonly string[]).includes(level,)) {
    throw new LocalInferenceUnavailable(`level "${level}" needs a downloaded model`,);
  }
  return { content: cleanupDraftLocally(text,), engine: "local-heuristics", local: true, };
}
