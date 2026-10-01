// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Default categories surfaced in the editor dropdown. */
export const TRAIT_CATEGORIES = [
  "personality",
  "physical",
  "background",
  "skill",
  "weakness",
  "custom",
] as const;

/** A single permanent trait row. */
export interface PermanentTrait {
  id: string;
  actor_id: string;
  trait_category: string;
  trait_name: string;
  value: unknown;
  created_at: string;
}

/** Draft state for the new/edit form. */
export interface TraitDraft {
  category: string;
  name: string;
  value: string;
  editingName: string | null;
}

/**
 * State plugin for the permanent-traits panel. Bound to a single actor via
 * `setActorId`. Supports list/create/update/delete of permanent traits with a
 * search filter and category dropdown.
 */
export interface ActorTraitsState {
  _trActorId: string | null;
  traits: PermanentTrait[];
  traitsLoading: boolean;
  traitsError: string;
  search: string;
  categoryFilter: string;
  draft: TraitDraft;
  busy: boolean;
  message: string;
  error: string;
  setActorId(actorId: string,): void;
  loadTraits(): Promise<void>;
  /** Filter `traits` by `search` + `categoryFilter`. */
  filteredTraits(): PermanentTrait[];
  /** Start editing a trait (copies values into the draft). */
  startEdit(trait: PermanentTrait,): void;
  /** Clear the draft and reset to "create" mode. */
  cancelEdit(): void;
  /** Save the draft (create if `editingName` is null, update otherwise). */
  save(): Promise<void>;
  /** DELETE a trait by name. */
  remove(traitName: string,): Promise<void>;
  /** Build the POST/PUT payload from the draft. */
  buildPayload(): Record<string, unknown>;
  /** Resolve a human label for a trait category code. */
  describeCategory(category: string,): string;
}
