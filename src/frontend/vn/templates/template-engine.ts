/**
 * VN Template Engine
 *
 * Core engine for VN scene templates — variable substitution,
 * template inheritance, and composition.
 */

// ── Types ──────────────────────────────────────────────────

import { jsonParseOr, jsonStringifyOr, safeJsonStringify, } from "../../../utils";

export interface VnTemplate {
  id: string;
  name: string;
  description: string;
  worldId: string;
  category: "scene" | "dialogue" | "transition" | "composite";
  version: number;
  variables: VnTemplateVariable[];
  body: VnTemplateBody;
  tags: string[];
  parentTemplateId?: string;
  createdAt: string;
  modifiedAt: string;
}

export interface VnTemplateVariable {
  name: string;
  type: "string" | "number" | "boolean" | "enum" | "asset";
  default?: unknown;
  required: boolean;
  description?: string;
  enum?: string[];
}

export interface VnTemplateBody {
  layout: "overlay" | "below" | "split" | "inherit";
  layoutConfig?: Record<string, unknown>;
  transition: string;
  dialogueStyle?: string;
  portrait?: {
    position: "left" | "right" | "center" | "inherit";
    size?: number;
    expression?: string;
  };
  background?: {
    scaling: "contain" | "cover" | "fill";
    filter?: string;
    parallax?: boolean;
  };
  text?: {
    typewriterSpeed: number;
    pauseOnPunctuation: boolean;
    fontStyle?: string;
  };
  content?: string;
}

export interface VnCompositeStep {
  templateId: string;
  variables?: Record<string, unknown>;
  condition?: string;
  delay?: number;
}

// ── Variable Resolver ──────────────────────────────────────

export function resolveVariables(
  template: VnTemplate,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const variable of template.variables) {
    const value = context[variable.name] ?? variable.default;

    if (variable.required && value === undefined) {
      throw new Error(`Required variable "${variable.name}" is missing`,);
    }

    resolved[variable.name] = value;
  }

  return resolved;
}

// ── Template Substitution ──────────────────────────────────

export function substituteTemplate(
  text: string,
  variables: Record<string, unknown>,
): string {
  return text.replaceAll(/\{\{(\w+)\}\}/g, (match, name,) => {
    const value = variables[name];
    if (value === undefined) { return match; }
    if (typeof value === "object" && value !== null) {
      return jsonStringifyOr(value, "{}",);
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value,);
    }
    return match;
  },);
}

// ── Template Inheritance ───────────────────────────────────

export function resolveTemplate(
  template: VnTemplate,
  templates: Map<string, VnTemplate>,
): VnTemplate {
  if (!template.parentTemplateId) { return template; }

  const parent = templates.get(template.parentTemplateId,);
  if (!parent) { return template; }

  const resolvedParent = resolveTemplate(parent, templates,);

  const inheritedVariables: VnTemplateVariable[] = [];
  for (const v of resolvedParent.variables) {
    if (template.variables.every((tv,) => tv.name !== v.name)) { inheritedVariables.push(v,); }
  }

  return {
    ...resolvedParent,
    ...template,
    body: {
      ...resolvedParent.body,
      ...template.body,
    },
    variables: [
      ...inheritedVariables,
      ...template.variables,
    ],
  };
}

// ── Template Storage (localStorage) ────────────────────────

const STORAGE_PREFIX = "vn-templates-";

export function getTemplatesForWorld(worldId: string,): VnTemplate[] {
  const key = `${STORAGE_PREFIX}${worldId}`;
  const data = localStorage.getItem(key,);
  if (!data) { return []; }

  return jsonParseOr(data, [],);
}

export function saveTemplate(template: VnTemplate,): void {
  const templates = getTemplatesForWorld(template.worldId,);
  const existing = templates.findIndex((t,) => t.id === template.id);

  const updated = {
    ...template,
    modifiedAt: new Date().toISOString(),
    version: template.version + 1,
  };

  if (existing === -1) {
    templates.push(updated,);
  } else {
    templates[existing] = updated;
  }

  const key = `${STORAGE_PREFIX}${template.worldId}`;
  localStorage.setItem(key, jsonStringifyOr(templates,),);
}

export function deleteTemplate(worldId: string, templateId: string,): void {
  const templates = getTemplatesForWorld(worldId,);
  const filtered: VnTemplate[] = [];
  for (const t of templates) {
    if (t.id !== templateId) { filtered.push(t,); }
  }
  const key = `${STORAGE_PREFIX}${worldId}`;
  localStorage.setItem(key, jsonStringifyOr(filtered,),);
}

export function getTemplate(worldId: string, templateId: string,): VnTemplate | null {
  const templates = getTemplatesForWorld(worldId,);
  return templates.find((t,) => t.id === templateId) ?? null;
}

// ── Template Export/Import ──────────────────────────────────

export function exportTemplate(template: VnTemplate,): string {
  const r = safeJsonStringify(template, 2,);
  return r.ok ? r.value : "{}";
}

export function importTemplate(json: string,): VnTemplate | null {
  const template = jsonParseOr<VnTemplate | null>(json, null,);
  if (!template?.id || !template.name || !template.worldId) {
    return null;
  }
  return template;
}
