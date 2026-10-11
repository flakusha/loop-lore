// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Shadow note — hidden narrative influence (API row shape). */
export interface ShadowNote {
  id: string;
  chat_id: string;
  type: "foreshadowing" | "consequence" | "hidden_fact" | "player_motivation" | "world_secret" | "narrative_hook";
  content: string;
  status: "hidden" | "revealed";
  trigger_condition: string | null;
  revealed_to: string[] | null;
  created_at: string;
}

/** Whiteneote — visible GM annotation (API row shape). */
export interface Whiteneote {
  id: string;
  chat_id: string;
  message_id: string | null;
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
