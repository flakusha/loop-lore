// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── NSFW Panel ──────────────────────────────────────────────

/** One intimacy pair as rendered by the panel (subset of the backend row). */
export interface NsfwIntimacyPairView {
  /** The actor that owns the score (the chat character). */
  actorId: string;
  /** The partner the score is measured against. */
  targetActorId: string;
  /** Display name of the partner, when it could be resolved. */
  targetDisplayName: string | null;
  /** Intimacy score, 0-100. */
  score: number;
  /** Threshold values already unlocked for this pair. */
  unlockedThresholds: number[];
}

/** Body profile as rendered by the panel (subset of the backend row). */
export interface NsfwBodyStatsView {
  stamina: number;
  flexibility: number;
  sensitivity: number;
  endurance: number;
  sizeCategory: string;
  build: string;
}

/** */
export interface ChatNsfwState {
  /** Intimacy pairs for the chat character; null until loaded or on failure. */
  _nsfwIntimacy: NsfwIntimacyPairView[] | null;
  /** Body profile for the chat character; null until loaded or on failure. */
  _nsfwBody: NsfwBodyStatsView | null;
  /** True when the backend denied access (403) — the panel stays hidden. */
  _nsfwUnavailable: boolean;
  /** True while a load is in flight. */
  _nsfwLoading: boolean;
  /** Load intimacy + body state for the active chat's character. */
  loadNsfwPanel(): Promise<void>;
}
