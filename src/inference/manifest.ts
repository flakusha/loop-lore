// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser-side inference manifest — advertises which auxiliary tasks may run
 * locally in the browser (opt-in, BYOK-local-models slice).
 *
 * Only cheap auxiliary tasks are eligible (prompt cleanup, draft analysis).
 * Main RPG generation stays server-side for quality. The model list is
 * filtered by the admin download policy (default allow, per-model overrides)
 * so the endpoint never advertises blocked models — shape only, never secrets.
 *
 * @module inference/manifest
 */

/** Tasks the browser may handle locally when the user opts in. */
export const ELIGIBLE_LOCAL_TASKS = ["prompt-improve", "prompt-analyze",] as const;

/** A task eligible for browser-side inference. */
export type LocalInferenceTask = (typeof ELIGIBLE_LOCAL_TASKS)[number];

/** Local inference gradation levels handled without a server round-trip. */
export const LOCAL_ONLY_LEVELS = ["spellcheck",] as const;

/** Gradation level handled locally without a model download. */
export type LocalOnlyLevel = (typeof LOCAL_ONLY_LEVELS)[number];
/** Per-model download override (by-model config, wins over the default). */
export interface LocalModelDownloadOverride {
  /** False blocks this model even when downloads are allowed by default. */
  allowDownload?: boolean;
}

/**
 * Browser-model download policy — admin default plus per-model overrides.
 * The admin sets the instance default; individual models opt out (or back
 * in) via by-model config. Absent policy means everything is downloadable.
 */
export interface LocalModelDownloadPolicy {
  /** Instance default. Default true when omitted. */
  allowDownloads?: boolean;
  /** Per-model overrides keyed by catalog id. Unknown ids are ignored. */
  models?: Record<string, LocalModelDownloadOverride>;
}

/**
 * Whether a catalog model may be downloaded under a policy.
 * @param modelId - Catalog model id.
 * @param policy - Download policy; omitted means allow.
 * @returns False only when blocked by per-model config or the default.
 */
export function isModelDownloadable(modelId: string, policy?: LocalModelDownloadPolicy,): boolean {
  const perModel = policy?.models?.[modelId]?.allowDownload;
  if (perModel !== undefined) { return perModel; }
  return policy?.allowDownloads ?? true;
}

/** Browser model descriptor (transformers.js/WebGPU, lazy-loaded, never bundled). */
export interface LocalModelDescriptor {
  id: string;
  label: string;
  engine: "transformers-webgpu" | "transformers-wasm";
  parameters: string;
  quantization: string;
  approxSizeMB: number;
  cdn: string;
}

/** Small instruct models suitable for auxiliary tasks on consumer hardware. */
export const BROWSER_MODEL_CATALOG: readonly LocalModelDescriptor[] = [
  {
    id: "SmolLM2-360M-Instruct",
    label: "SmolLM2 360M Instruct (fast, low memory)",
    engine: "transformers-webgpu",
    parameters: "360M",
    quantization: "q8f16",
    approxSizeMB: 380,
    cdn: "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct",
  },
  {
    id: "Qwen2.5-0.5B-Instruct",
    label: "Qwen2.5 0.5B Instruct (better quality, more memory)",
    engine: "transformers-webgpu",
    parameters: "0.5B",
    quantization: "q4f16",
    approxSizeMB: 400,
    cdn: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct",
  },
];

/** Static manifest payload served at GET /api/local-inference/manifest. */
export interface LocalInferenceManifest {
  version: 1;
  eligibleTasks: LocalInferenceTask[];
  localOnlyLevels: LocalOnlyLevel[];
  models: LocalModelDescriptor[];
  notes: string;
}

/**
 * Build the manifest payload, excluding models blocked by policy. Blocked
 * models are never advertised, so policy-abiding clients cannot offer them.
 * @param policy - Download policy; omitted advertises the full catalog.
 * @returns Versioned manifest of browser-offloadable tasks and models.
 */
export function buildLocalInferenceManifest(policy?: LocalModelDownloadPolicy,): LocalInferenceManifest {
  return {
    version: 1,
    eligibleTasks: [...ELIGIBLE_LOCAL_TASKS,],
    localOnlyLevels: [...LOCAL_ONLY_LEVELS,],
    models: BROWSER_MODEL_CATALOG.filter((model,) => isModelDownloadable(model.id, policy,)),
    notes: "Opt-in only. Browser inference never sends prompts to the server for eligible tasks.",
  };
}

/**
 * Whether a task may run locally in the browser.
 * @param task - Task identifier to check.
 * @returns True for auxiliary tasks listed in the manifest.
 */
export function isEligibleLocalTask(task: string,): task is LocalInferenceTask {
  return (ELIGIBLE_LOCAL_TASKS as readonly string[]).includes(task,);
}

/**
 * Whether a prompt-improve level runs locally without a model download.
 * @param level - Gradation level to check.
 * @returns True for deterministic local-only levels.
 */
export function isLocalOnlyLevel(level: string,): level is LocalOnlyLevel {
  return (LOCAL_ONLY_LEVELS as readonly string[]).includes(level,);
}
