// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** */
export interface ScorerContext {
  response: string;
  prompt: string;
  actorName: string;
  lore: string | null;
  quests: { name: string; progress: number; target: number }[];
  recentTurns: { response: string | null }[];
}

/** */
export type Scorer = (ctx: ScorerContext,) => number;
