// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character systems route validation schemas (admin overrides, mood, traits,
 * relationships, availability, licensing, avatars, emotions, export/import).
 */

import { t, } from "elysia";

// ── Character systems schemas ─────────────────────────────

export const AdminOverrideCreateBody = t.Object({
  action: t.String(),
  visibility_override: t.Optional(t.String(),),
  license_override: t.Optional(t.String(),),
  reason: t.Optional(t.String(),),
  expires_at: t.Optional(t.String(),),
},);

export const MoodCreateBody = t.Object({
  happiness: t.Optional(t.Number({ minimum: 0, maximum: 100, },),),
  expression: t.Optional(t.String(),),
  baseMood: t.Optional(t.String(),),
  worldId: t.Optional(t.String(),),
  moodStability: t.Optional(t.Number(),),
},);

export const MoodUpdateBody = t.Object({
  happiness: t.Optional(t.Number({ minimum: 0, maximum: 100, },),),
  expression: t.Optional(t.String(),),
  currentMood: t.Optional(t.String(),),
  moodStability: t.Optional(t.Number(),),
  worldId: t.Optional(t.String(),),
  expressionModifiers: t.Optional(t.Record(t.String(), t.Number(),),),
},);

export const MoodDeltaBody = t.Object({
  delta: t.Number(),
  reason: t.Optional(t.String(),),
  worldId: t.Optional(t.String(),),
},);

export const MoodEventBody = t.Object({
  eventType: t.String(),
  intensity: t.Optional(t.Number(),),
  details: t.Optional(t.String(),),
  source: t.Optional(t.String(),),
  sourceId: t.Optional(t.String(),),
  worldId: t.Optional(t.String(),),
  happinessDelta: t.Optional(t.Number(),),
  moodOverride: t.Optional(t.String(),),
},);

export const MoodStateResponse = t.Object({
  id: t.String(),
  actorId: t.String(),
  worldId: t.Nullable(t.String(),),
  happiness: t.Number(),
  baseMood: t.String(),
  currentMood: t.String(),
  moodStability: t.Number(),
  expressionModifiers: t.Record(t.String(), t.Number(),),
  lastMoodChange: t.String(),
},);

// Type aliases for backward compatibility
export type MoodCreateInput = typeof MoodCreateBody.static;
export type MoodUpdateInput = typeof MoodUpdateBody.static;
export type MoodEventInput = typeof MoodEventBody.static;

export const TraitCreateBody = t.Object({
  trait_category: t.String(),
  trait_name: t.String({ minLength: 1, },),
  value: t.Any(),
},);
export type TraitCreateInput = { category: string; name: string; value: string };

export const TraitUpdateBody = t.Object({
  value: t.Any(),
},);
export type TraitUpdateInput = { name: string; value: string };

export const WorldTraitCreateBody = t.Object({
  trait_category: t.String(),
  trait_name: t.String({ minLength: 1, },),
  value: t.Any(),
  world_id: t.String({ format: "uuid", },),
},);
export type WorldTraitCreateInput = { category: string; name: string; value: string; worldId: string };

export const LocationTraitCreateBody = t.Object({
  trait_category: t.String(),
  trait_name: t.String({ minLength: 1, },),
  value: t.Any(),
  location_id: t.String({ format: "uuid", },),
},);
export type LocationTraitCreateInput = {
  category: string;
  name: string;
  value: string;
  locationId: string;
  bonus?: number;
  penalty?: number;
  effects?: string;
};

export const LocationTraitUpdateBody = t.Object({
  value: t.Any(),
},);
export type LocationTraitUpdateInput = {
  name: string;
  value: string;
  bonus?: number;
  penalty?: number;
  effects?: string;
};

export const TraitResponse = t.Object({
  id: t.String({ format: "uuid", },),
  actor_id: t.String(),
  trait_category: t.String(),
  trait_name: t.String(),
  value: t.Any(),
  created_at: t.String(),
},);

export const AvatarCreateBody = t.Object({
  emotion: t.Optional(t.String(),),
  mood: t.Optional(t.String(),),
  image_url: t.Optional(t.String(),),
},);

export const AvatarUpdateBody = t.Object({
  emotion: t.Optional(t.String(),),
  mood: t.Optional(t.String(),),
  image_url: t.Optional(t.String(),),
},);

export const AvatarSelectBody = t.Object({
  avatar_id: t.String({ format: "uuid", },),
},);

export const AvatarConfigBody = t.Object({
  selection_rule_override: t.Optional(t.String(),),
  fallback_avatar_id: t.Optional(t.String({ format: "uuid", },),),
},);

export const WorldAvatarConfigBody = t.Object({
  selection_rule_override: t.Optional(t.String(),),
  fallback_avatar_id: t.Optional(t.String({ format: "uuid", },),),
},);

export const AvatarResponse = t.Object({
  id: t.String({ format: "uuid", },),
  actor_id: t.String(),
  emotion: t.Optional(t.String(),),
  mood: t.Optional(t.String(),),
  image_url: t.Optional(t.String(),),
  created_at: t.String(),
},);

export const ActorIdAssetIdParams = t.Object({
  actorId: t.String({ format: "uuid", },),
  assetId: t.String({ format: "uuid", },),
},);
export const ActorIdAvatarIdParams = t.Object({
  actorId: t.String({ format: "uuid", },),
  avatarId: t.String({ format: "uuid", },),
},);

export const ActorIdAvatarParams = t.Object({
  actorId: t.String({ format: "uuid", },),
},);

export const WorldActorParams = t.Object({
  worldId: t.String({ format: "uuid", },),
  actorId: t.String({ format: "uuid", },),
},);

export const CharacterEmotionBody = t.Object({
  emotion_name: t.String({ minLength: 1, },),
  intensity: t.Optional(t.Number({ minimum: 0, maximum: 100, },),),
},);

export const EmotionDefinitionCreateBody = t.Object({
  name: t.String({ minLength: 1, },),
  description: t.Optional(t.String(),),
  base_expression: t.Optional(t.String(),),
},);

export const ActorEmotionParams = t.Object({
  actorId: t.String({ format: "uuid", },),
  emotionName: t.String(),
},);

export const CharacterSystemsExportBody = t.Object({
  worldId: t.Optional(t.String(),),
  includeTraits: t.Optional(t.Boolean(),),
  includeMood: t.Optional(t.Boolean(),),
  includeRelationships: t.Optional(t.Boolean(),),
  includeAvatars: t.Optional(t.Boolean(),),
  includeLicensing: t.Optional(t.Boolean(),),
  includeAvailability: t.Optional(t.Boolean(),),
  includeWorldSetup: t.Optional(t.Boolean(),),
},);

export const CharacterSystemsImportUrlBody = t.Object({
  url: t.String({ format: "uri", },),
  actor_id: t.Optional(t.String({ format: "uuid", },),),
},);
