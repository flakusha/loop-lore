// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN staging directives — the state-machine input that drives sprite
 * enter/exit/swap from the message stream.
 *
 * Sources (no backend changes required):
 * - `scene.emotion`: keyword-hook `messages.emotion` column surfaced through
 *   VnMessage; selects the speaker's sprite variant at render time.
 * - cast deltas between consecutive scenes: members appearing enter the
 *   stage, members disappearing exit (roster visibility flip).
 *
 * Graceful by design: directives for unknown roster ids are no-ops, and
 * `swap` never mutates the roster — expression resolution happens at render
 * via `resolveSpriteUrl` with base-sprite fallback.
 */
import {
  setSpriteVisibility,
  type SpriteRoster,
  type SpriteRosterEntry,
} from "./sprite-stage";

/** State-machine input: a member enters, exits, or (re-)establishes expression. */
export type StageDirective =
  | { kind: "enter"; characterId: string }
  | { kind: "exit"; characterId: string }
  | { kind: "swap"; characterId: string; emotion: string };

/** Minimal scene view the derivation needs; VnScene satisfies this structurally. */
export interface SceneCastView {
  cast?: SpriteRosterEntry[];
  speakerId?: string | null;
  emotion?: string;
}

/**
 * Derive staging directives from a scene transition.
 * @param prev - Previous scene, or null for the first scene.
 * @param next - Incoming scene.
 * @returns Directives in stable order: enters, exits, then expression swap.
 */
export function deriveStageDirectives(prev: SceneCastView | null, next: SceneCastView,): StageDirective[] {
  const before = new Set((prev?.cast ?? []).map((c,) => c.characterId),);
  const after = new Set((next.cast ?? []).map((c,) => c.characterId),);
  const directives: StageDirective[] = [];
  for (const id of after) {
    if (!before.has(id,)) { directives.push({ kind: "enter", characterId: id, },); }
  }
  for (const id of before) {
    if (!after.has(id,)) { directives.push({ kind: "exit", characterId: id, },); }
  }
  if (
    next.emotion && next.speakerId && after.has(next.speakerId,) &&
    (prev?.speakerId !== next.speakerId || prev?.emotion !== next.emotion)
  ) {
    directives.push({ kind: "swap", characterId: next.speakerId, emotion: next.emotion, },);
  }
  return directives;
}

/**
 * Apply directives to the roster. Unknown ids are skipped (no-op); swap is
 * intentionally roster-neutral (render resolves the expression).
 * @param roster - Cast registry to mutate.
 * @param directives - Directives from deriveStageDirectives.
 */
export function applyStageDirectives(roster: SpriteRoster, directives: StageDirective[],): void {
  for (const directive of directives) {
    if (directive.kind === "enter") { setSpriteVisibility(roster, directive.characterId, true,); }
    else if (directive.kind === "exit") { setSpriteVisibility(roster, directive.characterId, false,); }
  }
}
