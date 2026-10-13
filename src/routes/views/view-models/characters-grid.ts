// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * View-model for `/dynamic/characters/grid` — the seam any non-htmx client
 * (TUI, mobile, a future egui app) consumes instead of re-deriving the same
 * projection from HTML.
 *
 * `buildCharactersGridViewModel()` is pure: it takes already-fetched actor
 * rows and returns plain JSON-able data. No database handle, no request
 * context, no `await`, no template rendering. Values are the raw, unescaped
 * text — escaping is the renderer's job, so the HTML and the JSON cannot drift.
 */

/** The subset of an `actors` row the characters grid projects. */
export interface CharacterGridActorRow {
  id: string;
  display_name: string;
  description: string | null;
  avatar_asset_id: string | null;
  review_state: string;
}

/** One grid row. `avatarUrl` is `null` when the actor has no avatar asset. */
export interface CharacterGridItem {
  id: string;
  displayName: string;
  description: string;
  avatarUrl: string | null;
  reviewState: string;
}

/** The whole grid. An empty `characters` array is what the template renders as its empty state. */
export interface CharactersGridViewModel {
  characters: CharacterGridItem[];
}

/**
 * Project fetched actor rows into the characters grid view-model.
 * @param actors - already-fetched, already-filtered actor rows in display order
 * @returns the JSON-able view-model the HTML template and the JSON branch share
 */
export function buildCharactersGridViewModel(
  { actors, }: { actors: readonly CharacterGridActorRow[] },
): CharactersGridViewModel {
  return {
    characters: Array.from(actors, (actor,) => ({
      id: actor.id,
      displayName: actor.display_name,
      description: actor.description || "",
      avatarUrl: actor.avatar_asset_id ? `/api/v1/assets/${actor.avatar_asset_id}/thumb` : null,
      reviewState: actor.review_state || "pending_review",
    }),),
  };
}
