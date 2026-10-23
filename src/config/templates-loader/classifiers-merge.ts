// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/templates-loader/classifiers-merge.ts — classifier template-pack
// merge strategies (cloned from the workflows pattern in merge-domains.ts).

import type {
  ClassifiersTemplateConfig,
  ClassTemplateConfig,
  MergeStrategy,
} from "../sections/templates";

/**
 * Apply merge strategy for classifier template packs.
 * Packs keyed by id; extend keeps base on conflict, override lets the
 * override win, replace discards base.
 * @param base
 * @param override
 * @param strategy
 * @returns void
 */
export function mergeClassifiersConfig(
  base: ClassifiersTemplateConfig,
  override: Partial<ClassifiersTemplateConfig>,
  strategy: MergeStrategy,
): ClassifiersTemplateConfig {
  const overridePacks: Record<string, ClassTemplateConfig> = override.classifiers ?? {};
  if (strategy === "replace") {
    return { merge: base.merge, classifiers: overridePacks, };
  }

  if (strategy === "override") {
    return {
      ...base,
      ...override,
      merge: base.merge,
      classifiers: { ...base.classifiers, ...overridePacks, },
    };
  }

  return {
    merge: base.merge,
    classifiers: { ...overridePacks, ...base.classifiers, },
  };
}
