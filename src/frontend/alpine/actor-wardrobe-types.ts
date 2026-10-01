// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** One outfit row from the wardrobe CRUD API (camelCase projection). */
export interface WardrobeOutfit {
  id: string;
  actorId: string | null;
  worldId: string | null;
  name: string;
  descriptor: string;
  tags: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** One avatar variant row (emotion × outfit dimension). */
export interface WardrobeVariant {
  id: string;
  assetId: string;
  label: string;
  tags: Record<string, unknown>;
  outfitId: string | null;
}

/** Draft state for the new/edit outfit form. */
export interface OutfitDraft {
  name: string;
  descriptor: string;
  /** Comma-separated tag input. */
  tagsInput: string;
  editingId: string | null;
}

/**
 * State plugin for the character-sheet wardrobe manager. Bound to a single
 * actor via `setActorId`. Supports list/create/update/delete of outfits plus
 * a variant grid grouped by outfit × emotion.
 */
export interface ActorWardrobeState {
  _wActorId: string | null;
  outfits: WardrobeOutfit[];
  variants: WardrobeVariant[];
  loading: boolean;
  loadError: string;
  draft: OutfitDraft;
  busy: boolean;
  message: string;
  error: string;
  setActorId(actorId: string,): void;
  load(): Promise<void>;
  /** Start editing an outfit (copies values into the draft). */
  startEdit(outfit: WardrobeOutfit,): void;
  /** Clear the draft and reset to "create" mode. */
  cancelEdit(): void;
  /** Save the draft (create when editingId is null, update otherwise). */
  save(): Promise<void>;
  /** DELETE one outfit by id. */
  remove(outfitId: string,): Promise<void>;
  /** Group variants by outfit: [{outfitId, name, variants}] sorted by name. */
  variantGrid(): { outfitId: string | null; outfitName: string; variants: WardrobeVariant[] }[];
}
