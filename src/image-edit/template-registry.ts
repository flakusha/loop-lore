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
export class TemplateRegistry {
  private templates = new Map<string, WorkflowTemplate>();

  /**
   * Ids each managed source contributed, so a source can replace its own slice
   * without touching anyone else's. Built-in and config workflows use plain
   * `register()` and never appear here.
   */
  private managed = new Map<string, Set<string>>();

  /**
   * Register a workflow template
   * @param template
   */
  register(template: WorkflowTemplate,): void {
    this.templates.set(template.id, template,);
  }

  /**
   * Replace every template contributed by `source`.
   *
   * Hydration is a full re-read of a table, so it has to be authoritative: a
   * row the operator deleted or disabled must vanish from the list, not linger
   * from the previous pass. Only `source`'s own ids are *removed* — built-in
   * TypeScript templates and config workflows registered by other sources are
   * not swept.
   *
   * A built-in whose id a managed source also claims is still **overwritten**:
   * the library copy wins, because it is the operator-editable one. This is
   * deliberate and it is lossy while library rows carry no parameter metadata —
   * see `src/generation/workflow-library/hydrate.ts`.
   * @param source - Ownership tag for the templates being replaced
   * @param templates - The full set `source` now owns
   */
  replaceManaged(source: string, templates: WorkflowTemplate[],): void {
    for (const id of this.managed.get(source,) ?? []) {
      this.templates.delete(id,);
    }
    this.managed.set(source, new Set(),);
    for (const template of templates) {
      this.templates.set(template.id, template,);
      this.managed.get(source,)?.add(template.id,);
    }
  }

  /**
   * Get a template by ID
   * @param id
   */
  get(id: string,): WorkflowTemplate | undefined {
    return this.templates.get(id,);
  }

  /** List all registered templates */
  /**
   * @returns {WorkflowTemplate[]}
   */
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
  /**
   * @returns {void}
   */
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
 * @returns {void}
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
 * @returns {void}
 */
export function registerBuiltinTemplates(registry: TemplateRegistry = templateRegistry,): void {
  if (builtinTemplatesRegistered) { return; }
  for (const template of builtinTemplates) {
    registry.register(template,);
  }
  builtinTemplatesRegistered = true;
}
