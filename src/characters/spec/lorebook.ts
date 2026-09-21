// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/spec/lorebook.ts — character-attached lorebook shapes.
// Re-exported from `character.ts` so downstream imports remain stable.

/** */
export interface LorebookData {
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  entries: LorebookEntry[];
}

/** */
export interface LorebookEntry {
  keys: string[];
  content: string;
  enabled: boolean;
  insertion_order: number;
  case_sensitive: boolean;
  name: string;
  priority: number;
  id: number;
  comment?: string;
  selective: boolean;
  constant: boolean;
  position: "before_char" | "after_char";
  use_regex?: boolean;
  /** Activation condition override (ticket FEAT-055). */
  key_type?: "keyword" | "regex";
  /** AND/OR activation groups: each inner array is AND, the outer array is OR. */
  key_groups?: string[][];
  /** How many recent user messages to scan for activation (default 1, max 10). */
  scan_depth?: number;
  /** Stochastic activation probability 0..1 for ambient lore. */
  activation_chance?: number;
  extensions?: Record<string, unknown>;
}
