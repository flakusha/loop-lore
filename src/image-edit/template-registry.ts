// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Template Registry — Manages workflow templates for image editing
 *
 * Templates are registered at startup and can be queried by category,
 * backend compatibility, or node availability.
 * @module template-registry
 */

import type { ComfyUIWorkflow, } from "../generation/providers/comfyui";
import type {
  ImageEditBackend,
  ImageEditCategory,
  WorkflowTemplate,
} from "./types";

import { builtinTemplates, } from "./templates/builtin";

// ── Config Integration ──────────────────────────────────────

import type { ImageEditTemplateConfig, } from "../config/sections/templates";

/** */
class TemplateRegistry {
  private templates = new Map<string, WorkflowTemplate>();

  /**
   * Register a workflow template
   * @param template
   */
  register(template: WorkflowTemplate,): void {
    this.templates.set(template.id, template,);
  }

  /**
   * Get a template by ID
   * @param id
   */
  get(id: string,): WorkflowTemplate | undefined {
    return this.templates.get(id,);
  }

  /** List all registered templates */
  listAll(): WorkflowTemplate[] {
    return [...this.templates.values(),];
  }

  /**
   * Filter templates by category
   * @param category
   */
  listByCategory(category: ImageEditCategory,): WorkflowTemplate[] {
    const out: WorkflowTemplate[] = [];
    for (const t of this.listAll()) { if (t.category === category) { out.push(t,); } }
    return out;
  }

  /**
   * Filter templates available for a specific backend
   * @param backend
   */
  listForBackend(backend: ImageEditBackend,): WorkflowTemplate[] {
    const out: WorkflowTemplate[] = [];
    for (const t of this.listAll()) { if (t.backends.includes(backend,)) { out.push(t,); } }
    return out;
  }

  /**
   * Filter templates that can run on the given backend AND have all required nodes installed
   * @param backend
   * @param installedNodes
   */
  listAvailable(
    backend: ImageEditBackend,
    installedNodes: Set<string>,
  ): WorkflowTemplate[] {
    const out: WorkflowTemplate[] = [];
    for (const t of this.listAll()) {
      if (
        t.backends.includes(backend,) &&
        t.required_nodes.every((node,) => installedNodes.has(node,))
      ) {
        out.push(t,);
      }
    }
    return out;
  }

  /**
   * Unregister a template by ID
   * @param id
   */
  unregister(id: string,): boolean {
    return this.templates.delete(id,);
  }

  /** Clear all templates */
  clear(): void {
    this.templates.clear();
  }
}

/** Singleton registry instance */
export const templateRegistry = new TemplateRegistry();

/**
 * Register workflow templates from config.
 *
 * Config workflows are definitions (id, name, category, backend).
 * They are registered as lightweight templates with a passthrough build function.
 * Full workflow nodes should be provided via the build function or loaded separately.
 * @param config - Image-edit template configuration
 * @param registry - Registry to register into (default: singleton)
 */
export function registerConfigWorkflows(
  config: ImageEditTemplateConfig,
  registry: TemplateRegistry = templateRegistry,
): void {
  for (const [id, workflow,] of Object.entries(config.workflows,)) {
    // Convert config workflow to WorkflowTemplate format
    // Config workflows are definitions; build function returns empty workflow
    const template: WorkflowTemplate = {
      id,
      name: workflow.name,
      category: workflow.category as ImageEditCategory,
      backends: [workflow.backend as ImageEditBackend,],
      description: workflow.description,
      required_nodes: [],
      parameters: [],
      build: () => (workflow.nodes as ComfyUIWorkflow) ?? {},
    };
    registry.register(template,);
  }
}

let builtinTemplatesRegistered = false;

/**
 * Register the built-in ComfyUI workflow templates into the singleton registry.
 * Idempotent — safe to call on every route mount.
 * @param registry
 */
export function registerBuiltinTemplates(registry: TemplateRegistry = templateRegistry,): void {
  if (builtinTemplatesRegistered) { return; }
  for (const template of builtinTemplates) {
    registry.register(template,);
  }
  builtinTemplatesRegistered = true;
}
