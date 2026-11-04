// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/items/seed/merge.ts — Merge built-in + user item templates

import type { ItemsConfig, } from "../../config/schema";

/**
 * Merge built-in defaults with user config templates.
 * User templates override built-in by name (case-insensitive).
 * @param defaults - Built-in item templates
 * @param userTemplates - User config templates
 * @returns Merged templates
 */
export function mergeItemTemplates(
  defaults: ItemsConfig["templates"],
  userTemplates: ItemsConfig["templates"],
): ItemsConfig["templates"] {
  const merged = new Map<string, ItemsConfig["templates"][number]>();

  // Add built-in defaults first
  for (const template of defaults) {
    merged.set(template.name.toLowerCase(), template,);
  }

  // User templates override built-in by name
  for (const template of userTemplates) {
    merged.set(template.name.toLowerCase(), template,);
  }

  return Array.from(merged.values(),);
}
