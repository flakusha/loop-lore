// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Shadow note — hidden narrative influence. */
export interface ShadowNote {
  id: string;
  chatId: string;
  type: "foreshadowing" | "consequence" | "hidden_fact" | "player_motivation" | "world_secret" | "narrative_hook";
  content: string;
  revealed: boolean;
  createdAt: string;
}

/** Whiteneote — visible GM annotation. */
export interface Whiteneote {
  id: string;
  chatId: string;
  messageId?: string;
  type: "narrative_direction" | "character_context" | "world_state" | "tone" | "pacing" | "theme";
  content: string;
  priority: number;
  scope: "scene" | "chapter" | "session" | "world";
  expiresAt?: string;
  createdAt: string;
}

/** In-story entity suggestion surfaced from narration scan. */
export interface EntitySuggestion {
  kind: string;
  name: string;
  seed: string;
}
