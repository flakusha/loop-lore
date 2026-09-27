// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ComfyUI workflow library — DB-backed storage, ingest validation, boot seed,
 * and registry hydration.
 *
 * The graph lives inline in `prompt_templates.payload` under the `workflow`
 * modality; there is deliberately no disk sync (see the epic design notes on
 * the absence of any config-file writer in this codebase).
 * @module workflow-library
 */

export {
  ensureWorkflowRegistry,
  hydrateWorkflowRegistry,
  invalidateWorkflowRegistry,
  resetWorkflowRegistryForTests,
} from "./hydrate";
export {
  buildWorkflowGraph,
  missingRequiredNodes,
  rowToPayload,
  rowToTemplate,
  type WorkflowRow,
} from "./row";
export {
  resetSeedOwnerForTests,
  type SeedOutcome,
  seedWorkflowLibrary,
} from "./seed";
export { validateWorkflowPayload, type ValidationResult, } from "./validate";
