/**
 * Template Registry — Manages workflow templates for image editing
 *
 * Templates are registered at startup and can be queried by category,
 * backend compatibility, or node availability.
 *
 * @module template-registry
 */

import type {
  ImageEditBackend,
  ImageEditCategory,
  WorkflowTemplate,
} from "./types";

class TemplateRegistry {
  private templates = new Map<string, WorkflowTemplate>();

  /** Register a workflow template */
  register(template: WorkflowTemplate,): void {
    this.templates.set(template.id, template,);
  }

  /** Get a template by ID */
  get(id: string,): WorkflowTemplate | undefined {
    return this.templates.get(id,);
  }

  /** List all registered templates */
  listAll(): WorkflowTemplate[] {
    return [...this.templates.values(),];
  }

  /** Filter templates by category */
  listByCategory(category: ImageEditCategory,): WorkflowTemplate[] {
    return this.listAll().filter((t,) => t.category === category);
  }

  /** Filter templates available for a specific backend */
  listForBackend(backend: ImageEditBackend,): WorkflowTemplate[] {
    return this.listAll().filter((t,) => t.backends.includes(backend,));
  }

  /** Filter templates that can run on the given backend AND have all required nodes installed */
  listAvailable(
    backend: ImageEditBackend,
    installedNodes: Set<string>,
  ): WorkflowTemplate[] {
    return this.listAll().filter(
      (t,) =>
        t.backends.includes(backend,) &&
        t.required_nodes.every((node,) => installedNodes.has(node,)),
    );
  }

  /** Unregister a template by ID */
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
