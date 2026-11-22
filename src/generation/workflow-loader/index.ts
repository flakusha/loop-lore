// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Workflow Loader — Load ComfyUI workflow JSON files from disk
 *
 * Reads workflow definitions from `configs/workflows/` directory,
 * caches them in memory, and applies template variable substitution.
 *
 * Workflow files are standard ComfyUI API-format JSON with
 * `{{variable}}` placeholders in node inputs.
 * @module workflow-loader
 */

// ── Loader / singleton ─────────────────────────────────────
export { getWorkflowLoader, resetWorkflowLoaderForTests, } from "./loader";

// ── Convenience one-shot loader ────────────────────────────
export { loadComfyUIWorkflow, } from "./convenience";

// ── Graph validation ───────────────────────────────────────
export { findDeadNodes, isValidWorkflow, TERMINAL_SINK_CLASSES, } from "./workflow-validation";
export { Graph, } from "./graph-builder";
export type { GraphFinishOptions, GraphOptions, GraphResult, } from "./graph-builder";

// ── Generated graph gate ───────────────────────────────────
export {
  assertGeneratedGraph,
  type GeneratedGraphOptions,
  type GeneratedGraphResult,
  validateGeneratedGraph,
} from "./generated-validation";

// ── Public types ───────────────────────────────────────────
export type { LoadWorkflowOptions, } from "./types";
