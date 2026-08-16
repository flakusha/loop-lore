// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/seed/merge.ts — Merge built-in + user character templates

import type { CharactersConfig, } from "../../config/schema";

/**
 * Merge built-in defaults with user config templates.
 * User templates override built-in by name (case-insensitive).
 *
 * @param defaults - Built-in character templates
 * @param userTemplates - User config templates
 * @returns Merged templates
 */
export function mergeCharacterTemplates(
  defaults: CharactersConfig["templates"],
  userTemplates: CharactersConfig["templates"],
): CharactersConfig["templates"] {
  const merged = new Map<string, CharactersConfig["templates"][number]>();

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
