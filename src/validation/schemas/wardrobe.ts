// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Wardrobe / outfit validation schemas (Elysia TypeBox).
 *
 * Covers wardrobe item CRUD, inventory-instance bindings, chat/scene
 * outfit overrides, location→outfit rules, outfit-scoped avatar
 * generation, and context-aware outfit resolution.
 */
import { t, } from "elysia";

/** Fields shared by the wardrobe item create + update bodies. */
const ItemOptionalProps = {
  descriptor: t.Optional(t.String(),),
  tags: t.Optional(t.Array(t.String(),),),
  sort_order: t.Optional(t.Number(),),
};

/** Body for creating a wardrobe item. */
export const WardrobeItemCreateBody = t.Object({
  name: t.String({ minLength: 1, },),
  ...ItemOptionalProps,
  /** World template scope; omitted = actor-personal item. */
  world_id: t.Optional(t.String(),),
},);

/** Body for updating a wardrobe item (partial). */
export const WardrobeItemUpdateBody = t.Object({
  name: t.Optional(t.String({ minLength: 1, },),),
  ...ItemOptionalProps,
},);

/** Body for binding an inventory item instance into an outfit. */
export const WardrobeBindBody = t.Object({
  item_instance_id: t.String({ minLength: 1, },),
},);

/** Body for the chat/scene outfit override; null clears the override. */
export const ChatOutfitOverrideBody = t.Object({
  actor_id: t.String({ minLength: 1, },),
  outfit_id: t.Nullable(t.String(),),
},);

/** Body for replacing the location→outfit rule map in one world. */
export const LocationOutfitBindingsBody = t.Object({
  bindings: t.Record(t.String(), t.String(),),
},);

/** Prompt knobs shared by the batch and single outfit-generation bodies. */
const OutfitGeneratePromptProps = {
  prompt_prefix: t.Optional(t.String(),),
  negative_prompt: t.Optional(t.String(),),
  /** Re-roll the (emotion, outfit) slots instead of appending. */
  replace: t.Optional(t.Boolean(),),
};

/** Body for outfit-scoped batch emotion-avatar generation. */
export const OutfitGenerateBody = t.Object({
  base_avatar_id: t.String({ minLength: 1, },),
  emotions: t.Optional(t.Array(t.String(),),),
  ...OutfitGeneratePromptProps,
},);

/** Body for a single (emotion, outfit) slot generation. */
export const OutfitGenerateSingleBody = t.Object({
  base_avatar_id: t.String({ minLength: 1, },),
  emotion: t.String({ minLength: 1, },),
  ...OutfitGeneratePromptProps,
},);

/** Body for context-aware outfit + avatar resolution (selection v2). */
export const OutfitResolveBody = t.Object({
  emotion: t.Optional(t.String(),),
  mood: t.Optional(t.String(),),
  action: t.Optional(t.String(),),
  location: t.Optional(t.String(),),
  time: t.Optional(t.String(),),
  outfit: t.Optional(t.String(),),
  worldId: t.Optional(t.String(),),
  chatId: t.Optional(t.String(),),
  locationId: t.Optional(t.String(),),
  outfitId: t.Optional(t.Nullable(t.String(),),),
},);

/** Params for wardrobe item routes. */
export const WardrobeItemParams = t.Object({
  actorId: t.String({ minLength: 1, },),
  itemId: t.String({ minLength: 1, },),
},);

/** Params for binding routes (item + binding row). */
export const WardrobeBindingParams = t.Object({
  actorId: t.String({ minLength: 1, },),
  itemId: t.String({ minLength: 1, },),
  bindingId: t.String({ minLength: 1, },),
},);

/** Params for chat override routes (wardrobe). */
export const WardrobeChatParams = t.Object({
  id: t.String({ minLength: 1, },),
},);

/** Params for actor-only wardrobe routes (list/create/resolve). */
export const WardrobeActorParams = t.Object({
  actorId: t.String({ minLength: 1, },),
},);
