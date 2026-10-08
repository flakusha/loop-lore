// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Single-assembly injection: visibility filter + content-hash dedup.
 *
 * Normative per `epic-hidden-carriage-context` §Isolation:
 * - Every injectable entry carries `{ system, visibility }`; the assembler
 *   strips non-visible entries server-side for the requesting role.
 *   `gm`-class entries never reach player prompts; no system reads
 *   another system's shadow scope (quest × shadow, carriage × shadow).
 * - Carriage, notes, quest progress, and provisioned memory submit entries
 *   with `{ source, id, hash }`; the assembler dedups by content hash —
 *   same fact from two systems injected once, attributed to first source.
 * - Relaxed only for debug sessions and assistant flows: shadow entries
 *   included explicitly marked read-only. Enforcement lives here, never
 *   UI-only.
 */

import { contentHash, dedupeByHash, type DuplicateEntry, } from "../../utils/content-hash";

/** Visibility class of one injectable entry. */
export type EntryVisibility = "player" | "gm" | "debug";

/** Role the prompt is being assembled for. */
export type AssembleRole = "player" | "gm" | "debug" | "assistant";

/** One injectable fact from any submitting system. */
export interface InjectableEntry {
  /** Submitting system: carriage | notes | quests | memory | shadow | gameState ... */
  system: string;
  /** Unique id within the submitting system. */
  id: string;
  /** Fact text hashed for dedup. */
  content: string;
  /** Visibility class — `gm` never reaches player prompts. */
  visibility: EntryVisibility;
  /** True only when explicitly included for a debug/assistant flow (read-only). */
  shadowReadOnly?: boolean;
}

/** Shadow-owning systems: their entries are `gm`-class and never cross-read. */
const SHADOW_SYSTEMS = new Set(["shadow", "gmNotes-shadow",],);

/**
 * Server-side visibility filter: keep entries visible to `role`.
 * Player prompts get player-class only; gm/debug/assistant flows may
 * additionally receive gm-class entries, explicitly marked read-only.
 * @param entries - candidate entries
 * @param role - requesting role
 * @returns visible entries (shadow ones marked read-only for non-players)
 */
export function filterVisible(entries: readonly InjectableEntry[], role: AssembleRole,): InjectableEntry[] {
  if (role === "player") {
    return entries.filter((e,) => e.visibility === "player");
  }

  return entries
    .filter((e,) =>
      e.visibility === "player" || e.visibility === "gm" || (role === "debug" && e.visibility === "debug")
    )
    .map((e,) => e.visibility === "gm" || e.visibility === "debug" ? { ...e, shadowReadOnly: true, } : e);
}

/** Merged assembly outcome: first-seen uniques + dropped-duplicate provenance. */
export interface AssembledEntries {
  entries: InjectableEntry[];
  duplicates: DuplicateEntry<InjectableEntry>[];
}

/**
 * Merge entries from all submitting systems: filter by role server-side,
 * then dedup by content hash (first source wins). Carriage never ingests
 * shadow content: any shadow-system entry with a non-shadow content match
 * is dropped before dedup so spoiler text cannot leak via hash collision
 * with a player-visible fact.
 * @param entries - entries in source-priority order (first source wins)
 * @param role - requesting role
 * @returns uniques + dropped-duplicate provenance for the debug view
 */
export function assembleEntries(entries: readonly InjectableEntry[], role: AssembleRole,): AssembledEntries {
  const visible = filterVisible(entries, role,);
  // Cross-system negative read: shadow-system entries with a non-shadow
  // visibility class never flow into a player-scoped assembly.
  const unshadowed = visible.filter((e,) => !isShadowLeak(e,));
  // Same fact from two systems injected once, attributed to first source.
  const { unique, duplicates, } = dedupeByHash(unshadowed, (e,) => e.content,);
  return { entries: unique, duplicates, };
}

/**
 * Cross-system negative read: shadow content never flows into a
 * player-scoped system (carriage, quests, notes).
 * @param entry - candidate entry
 * @returns true when the entry must be dropped
 */
function isShadowLeak(entry: InjectableEntry,): boolean {
  return SHADOW_SYSTEMS.has(entry.system,) && entry.visibility !== "gm" && entry.visibility !== "debug";
}

/**
 * Write-back guard: any pipeline carrying shadow-marked entries rejects
 * persistence to player-scoped tables (notes, quests, carriage).
 * @param entries - entries the pipeline would persist
 * @param targetSystem - destination system
 * @returns dev-visible violation message, or null when the write is allowed
 */
export function guardShadowWriteback(
  entries: readonly InjectableEntry[],
  targetSystem: string,
): string | null {
  if (targetSystem === "shadow") { return null; }
  const leaked = entries.filter((e,) => e.shadowReadOnly === true || SHADOW_SYSTEMS.has(e.system,));
  if (leaked.length === 0) { return null; }
  return `Shadow write-back blocked: ${leaked.length} shadow-marked entr${leaked.length === 1 ? "y" : "ies"} ` +
    `(${
      leaked.map((e,) => `${e.system}:${e.id}`).join(", ",)
    }) must never persist to player-visible "${targetSystem}".`;
}

/**
 * Hash an entry's content for the `{ source, id, hash }` debug contract.
 * Content-only (not system-qualified) so the same fact from two systems
 * shares one dedup key — matching `assembleEntries`.
 * @param entry - entry to hash
 * @returns 8-char dedup key
 */
export function entryHash(entry: InjectableEntry,): string {
  return contentHash(entry.content,);
}
