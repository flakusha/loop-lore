// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Talkativity resolver — pick the effective 0-10 talkativity for a
 * (chat, actor) pair. Precedence:
 *   1. opts.override (per-actor override, e.g. scene directive)
 *   2. chat.talkativity (per-chat override stored in story_state JSON)
 *   3. actor.talkativity (the per-participant baseline)
 *   4. DEFAULT_TALKATIVITY (5)
 *
 * Clamped to the [MIN_TALKATIVITY, MAX_TALKATIVITY] window so a bad
 * migration or stale DB row can never poison turn selection.
 */

import type { TurnParticipant, } from "./types";

/** Default talkativity when nothing else applies. */
export const DEFAULT_TALKATIVITY = 5;

/** Lower clamp bound (inclusive). */
export const MIN_TALKATIVITY = 0;

/** Upper clamp bound (inclusive). */
export const MAX_TALKATIVITY = 10;

/** Shape of a per-chat talkativity override (story_state JSON subkey). */
export interface ChatTalkativity {
  talkativity?: number | null;
}

/** Options accepted by {@link effectiveTalkativity}. */
export interface TalkativityOpts {
  /** Per-actor override; wins above everything else. */
  override?: number | null;
}

const clampWindow = (value: number,): number => Math.max(MIN_TALKATIVITY, Math.min(MAX_TALKATIVITY, value,),);

/**
 * Compute the effective talkativity for an actor inside a chat.
 * @param actor - Participant row (carries baseline talkativity).
 * @param chat - Chat-scoped talkativity override.
 * @param opts - Resolver options (per-actor override).
 */
export function effectiveTalkativity(
  actor: Pick<TurnParticipant, "talkativity">,
  chat: ChatTalkativity = {},
  opts: TalkativityOpts = {},
): number {
  if (typeof opts.override === "number") {
    return clampWindow(opts.override,);
  }
  if (typeof chat.talkativity === "number") {
    return clampWindow(chat.talkativity,);
  }
  return clampWindow(actor.talkativity ?? DEFAULT_TALKATIVITY,);
}
