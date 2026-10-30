// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lore types — shared row shape for both `actor_lore_entries` and
 * `world_lore_entries`. Extracted from `lore.ts` to keep that file under the
 * 250-line size limit.
 *
 * Lifecycle fields (confidence / last_verified / distortion_level /
 * source_count / disputed) are present on `world_lore_entries` (005 migration)
 * and absent on `actor_lore_entries`; consumers must tolerate `undefined` and
 * apply defaults at the gate site.
 *
 * Resolves: TASK-world-lore-lifecycle-confidence-decay-distortion
 */
import type { ActivationEntry, } from "./lore-activation";

/** Row shape returned by the lore queries. */
export interface LoreRow extends ActivationEntry {
  content: string;
  position: unknown;
  constant: number | boolean;
  selective: number | boolean;
  cooldown_seconds: number;
  last_activated: string | null;
  id: string;
  audience_scope: string | null;
  priority: number;
  confidence?: number;
  last_verified?: string | null;
  distortion_level?: number;
  source_count?: number;
  disputed?: number;
  /**
   * Secret-lore reveal gate (084, epic-lore-knowledge): JSON condition text;
   * null/blank = not secret. Optional — consumers tolerate `undefined` and
   * apply defaults at the gate site (same convention as lifecycle fields).
   */
  reveal_condition?: string | null;
  /** Timeline scoping slug; null/undefined = available on every timeline. */
  timeline_id?: string | null;
  /** Unified rarity tier; null/undefined = common (weight 1, always passes). */
  rarity?: string | null;
}
