// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser-side inference manifest — advertises which auxiliary tasks may run
 * locally in the browser (opt-in, BYOK-local-models slice).
 *
 * Only cheap auxiliary tasks are eligible (prompt cleanup, draft analysis).
 * Main RPG generation stays server-side for quality. The manifest is static
 * (no DB, no migration) so the capability endpoint is safe to expose
 * unauthenticated — it advertises shape, never secrets.
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
 * Build the static manifest payload.
 * @returns Versioned manifest of browser-offloadable tasks and models.
 */
export function buildLocalInferenceManifest(): LocalInferenceManifest {
  return {
    version: 1,
    eligibleTasks: [...ELIGIBLE_LOCAL_TASKS,],
    localOnlyLevels: [...LOCAL_ONLY_LEVELS,],
    models: [...BROWSER_MODEL_CATALOG,],
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
