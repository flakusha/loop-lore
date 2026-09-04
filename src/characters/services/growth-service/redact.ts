// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Player-card redaction for character growth state.
 *
 * The player-facing card should never leak:
 * - `pending` growth_log entries (LLM-assist proposals not yet approved)
 * - `growth_mode` itself (an author toggle, not a player-facing detail)
 * - Per-trait drift internals (before/after snapshots with full JSON)
 *
 * Author/GM/owner views show all entries without redaction.
 *
 * Per `.plan/epics/epic-character-growth.md` Q7: this helper is a
 * standalone ownership boundary. When `epic-character-internal-traits.md`
 * lands its `toPublicCard()` transform, the two helpers MUST be merged
 * into `src/characters/to-public-card.ts` so redaction is uniform.
 */
import type {
  CharacterArc,
  GrowthLogEntry,
} from "../../spec/growth";
import {
  GrowthEntryStatus,
} from "../../spec/growth";

/** Viewer role for redaction decisions. */
export type GrowthRedactionViewer = "player" | "author" | "gm" | "owner";

/** Public player-safe arc shape. */
export interface PublicCharacterArc {
  actorId: string;
  currentStage: CharacterArc["currentStage"];
  stageDescription: string | null;
}

/** Public player-safe growth entry shape. */
export interface PublicGrowthLogEntry {
  id: string;
  actorId: string;
  axis: GrowthLogEntry["axis"];
  eventType: GrowthLogEntry["eventType"];
  recordedAt: string;
  reason: string;
}

/**
 * Strip an arc row of any author-only fields. Currently the arc itself
 * is public-safe (current stage + author description are surfaced to
 * players as the "Character Journey" section), so this is a pass-through
 * shape-trim. Kept as a function for symmetry with `redactGrowthLogEntry`
 * and so the merge with `toPublicCard()` converges.
 * @param arc
 */
export function redactArcForPlayerCard(arc: CharacterArc | null,): PublicCharacterArc | null {
  if (!arc) { return null; }
  return {
    actorId: arc.actorId,
    currentStage: arc.currentStage,
    stageDescription: arc.stageDescription,
  };
}

/**
 * Redact a growth_log entry for the player card.
 *
 * Players see only `applied` entries; `pending` and `rejected` rows are
 * filtered out before they reach this helper. The helper additionally
 * strips internal fields (subject IDs, before/after JSON, confirmer).
 *
 * Author/GM/owner views bypass this helper entirely.
 * @param entry
 */
export function redactGrowthLogEntry(entry: GrowthLogEntry,): PublicGrowthLogEntry {
  return {
    id: entry.id,
    actorId: entry.actorId,
    axis: entry.axis,
    eventType: entry.eventType,
    recordedAt: entry.recordedAt,
    reason: entry.reason,
  };
}

/**
 * Compose the player-safe growth view: applied entries only, fields
 * trimmed, status filtered. Use this in the player card path.
 *
 * For author/GM/owner views, use `listGrowthLog()` directly with
 * `includePending: true`.
 * @param entries - All entries (applied + pending + rejected)
 */
export function redactGrowthLogForPlayerCard(
  entries: readonly GrowthLogEntry[],
): PublicGrowthLogEntry[] {
  return entries
    .filter((e,) => e.status === GrowthEntryStatus.Applied,)
    .map(redactGrowthLogEntry,);
}
