// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/templates-loader/merge-domains.ts — image-edit, character and
// assistant-workflow merge strategies (split from merge.ts; the functions are
// re-exported there so existing import paths keep working).

import type {
  AssistantWorkflowConfig,
  CharacterTemplateConfig,
  ImageEditTemplateConfig,
  MergeStrategy,
  WorkflowTemplateConfig,
} from "../sections/templates";

/**
 * Apply merge strategy for image-edit templates
 * @param base
 * @param override
 * @param strategy
 */
export function mergeImageEditConfig(
  base: ImageEditTemplateConfig,
  override: Partial<ImageEditTemplateConfig>,
  strategy: MergeStrategy,
): ImageEditTemplateConfig {
  if (strategy === "replace") {
    return {
      merge: base.merge,
      workflows: override.workflows ?? {},
    };
  }

  if (strategy === "override") {
    return {
      ...base,
      ...override,
      merge: base.merge,
      workflows: { ...base.workflows, ...override.workflows, },
    };
  }

  // extend: existing workflows keep base values, new ones are added
  return {
    merge: base.merge,
    workflows: { ...override.workflows, ...base.workflows, },
  };
}

/**
 * Apply merge strategy for character templates
 * @param base
 * @param override
 * @param strategy
 */
export function mergeCharacterConfig(
  base: CharacterTemplateConfig,
  override: Partial<CharacterTemplateConfig>,
  strategy: MergeStrategy,
): CharacterTemplateConfig {
  if (strategy === "replace") {
    return {
      merge: base.merge,
      templates: override.templates ?? [],
    };
  }

  if (strategy === "override") {
    // Override: user templates replace built-in by name
    const merged = new Map<string, CharacterTemplateConfig["templates"][number]>();
    for (const t of base.templates) {
      merged.set(t.name.toLowerCase(), t,);
    }
    const overrideTemplates = override.templates ?? [];
    for (const t of overrideTemplates) {
      merged.set(t.name.toLowerCase(), t,);
    }
    return {
      ...base,
      ...override,
      merge: base.merge,
      templates: Array.from(merged.values(),),
    };
  }

  // extend: existing templates keep base versions; only new names are added
  const merged = new Map<string, CharacterTemplateConfig["templates"][number]>();
  for (const t of base.templates) {
    merged.set(t.name.toLowerCase(), t,);
  }
  const overrideTemplates = override.templates ?? [];
  for (const t of overrideTemplates) {
    const key = t.name.toLowerCase();
    if (!merged.has(key,)) {
      merged.set(key, t,);
    }
  }
  return {
    merge: base.merge,
    templates: Array.from(merged.values(),),
  };
}

/**
 * Apply merge strategy for assistant workflow templates.
 * Workflows keyed by id; extend keeps base on conflict, override lets
 * the override win, replace discards base.
 * @param base
 * @param override
 * @param strategy
 */
export function mergeWorkflowConfig(
  base: WorkflowTemplateConfig,
  override: Partial<WorkflowTemplateConfig>,
  strategy: MergeStrategy,
): WorkflowTemplateConfig {
  const overrideWorkflows: Record<string, AssistantWorkflowConfig> = override.workflows ?? {};
  if (strategy === "replace") {
    return {
      merge: base.merge,
      workflows: overrideWorkflows,
    };
  }
  if (strategy === "override") {
    return {
      ...base,
      ...override,
      merge: base.merge,
      workflows: { ...base.workflows, ...overrideWorkflows, },
    };
  }
  return {
    merge: base.merge,
    workflows: { ...overrideWorkflows, ...base.workflows, },
  };
}
