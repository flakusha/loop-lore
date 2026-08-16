// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Image Edit Module — Unified ComfyUI + sd-server image editing
 *
 * Provides:
 * - Workflow template system with built-in templates
 * - ComfyUI and sd-server providers
 * - Node discovery
 * - API routes for run, templates, nodes, capabilities, health
 *
 * @module image-edit
 */

// ── Types ────────────────────────────────────────────────────

export type {
  ImageEditBackend,
  ImageEditCategory,
  ImageEditProgress,
  ImageEditProvider,
  ImageEditRequest,
  ImageEditResult,
  LoraEntry,
  LoraTemplateParams,
  TemplateParameter,
  TemplateParamType,
  WorkflowTemplate,
} from "./types";

// ── Template Registry ────────────────────────────────────────

export { templateRegistry, } from "./template-registry";

// ── Built-in Templates ───────────────────────────────────────

export { builtinTemplates, } from "./templates/builtin";

// ── Providers ────────────────────────────────────────────────

export { ComfyUIEditProvider, } from "./providers/comfyui-provider";
export { SDServerEditProvider, } from "./providers/sd-server-provider";

// ── Routes ───────────────────────────────────────────────────

export {
  handleCapabilities,
  handleHealth,
  handleNodes,
  handleRun,
  handleTemplates,
} from "./routes";
