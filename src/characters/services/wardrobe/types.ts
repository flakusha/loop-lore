// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Scope of a wardrobe item: personal (actor) or shared world template. */
export type WardrobeScope = "actor" | "world";

/** A wardrobe item (outfit definition) with parsed tags. */
export interface WardrobeItem {
  id: string;
  /** Owner actor id when scope is `actor`; null for world templates. */
  actorId: string | null;
  /** World id when scope is `world`; null for actor-personal items. */
  worldId: string | null;
  name: string;
  /** Prompt fragment composed into outfit-scoped generation. */
  descriptor: string;
  tags: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** One inventory item instance bound into an actor's outfit. */
export interface WardrobeBinding {
  id: string;
  actorId: string;
  wardrobeItemId: string;
  /** `actor_items` instance id; null when the instance was deleted. */
  itemInstanceId: string | null;
  createdAt: string;
}

/** Options for creating a wardrobe item. */
export interface CreateWardrobeItemOpts {
  actorId?: string;
  worldId?: string;
  name: string;
  descriptor?: string;
  tags?: string[];
  sortOrder?: number;
}

/** Options for updating a wardrobe item (partial). */
export interface UpdateWardrobeItemOpts {
  name?: string;
  descriptor?: string;
  tags?: string[];
  sortOrder?: number;
}

/**
 * Outfit resolution context — the top of the selection ladder.
 * Precedence: chat override > location/world rule > character default.
 */
export interface OutfitResolutionContext {
  actorId: string;
  /** Explicit chat/scene override lookup key. */
  chatId?: string;
  /** World + location rule lookup key. */
  worldId?: string;
  locationId?: string;
}

/** Where a resolved outfit came from (for tests + prompt context). */
export type OutfitResolutionSource =
  | "chat_override"
  | "location_rule"
  | "equipped_loadout"
  | "default"
  | "none";

/** Result of outfit resolution for one actor in one context. */
export interface ResolvedOutfit {
  /** Null = no outfit binding; callers keep today's base behavior. */
  outfitId: string | null;
  source: OutfitResolutionSource;
}
