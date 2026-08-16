/**
 * Character relations route validation schemas — relationships,
 * availability, licensing (all backed by `010_character_systems` tables).
 */

import { t, } from "elysia";

export const RelationshipCreateBody = t.Object({
  target_actor_id: t.String({ format: "uuid", },),
  relationship_type: t.String(),
  world_id: t.Optional(t.String({ format: "uuid", },),),
  standing: t.Optional(t.Number(),),
  trust: t.Optional(t.Number(),),
  familiarity: t.Optional(t.Number(),),
  is_bidirectional: t.Optional(t.Boolean(),),
  metadata: t.Optional(t.Record(t.String(), t.Any(),),),
},);

export const RelationshipUpdateBody = t.Object({
  world_id: t.Optional(t.String({ format: "uuid", },),),
  relationship_type: t.Optional(t.String(),),
  standing: t.Optional(t.Number(),),
  trust: t.Optional(t.Number(),),
  familiarity: t.Optional(t.Number(),),
  metadata: t.Optional(t.Record(t.String(), t.Any(),),),
},);

export const RelationshipEventBody = t.Object({
  target_actor_id: t.String({ format: "uuid", },),
  event_type: t.String(),
  world_id: t.Optional(t.String({ format: "uuid", },),),
  standing_delta: t.Optional(t.Number(),),
  trust_delta: t.Optional(t.Number(),),
  familiarity_delta: t.Optional(t.Number(),),
  metadata: t.Optional(t.Record(t.String(), t.Any(),),),
},);

/**
 * Relationship response — the service emits a camelCase object, so the
 * declared schema mirrors the actual (untransformed) output shape.
 */
export const RelationshipResponse = t.Object({
  id: t.String(),
  actorId: t.String(),
  targetActorId: t.String(),
  worldId: t.Nullable(t.String(),),
  relationshipType: t.String(),
  standing: t.Number(),
  trust: t.Number(),
  familiarity: t.Number(),
  isBidirectional: t.Boolean(),
  metadata: t.Record(t.String(), t.Any(),),
  createdAt: t.String(),
  updatedAt: t.String(),
},);

export const ActorTargetParams = t.Object({
  actorId: t.String({ format: "uuid", },),
  targetActorId: t.String({ format: "uuid", },),
},);

/**
 * Availability upsert body — mirrors the `character_availability` columns
 * (all optional: the endpoint upserts, keeping existing values for absent keys).
 */
export const AvailabilityBody = t.Object({
  status: t.Optional(t.String(),),
  usage_policy: t.Optional(t.Nullable(t.String(),),),
  activity_restrictions: t.Optional(t.Array(t.String(),),),
  content_policy: t.Optional(t.Nullable(t.String(),),),
  nsfw_policy: t.Optional(t.Nullable(t.String(),),),
},);

/**
 * Licensing upsert body — mirrors the `character_licensing` columns
 * (all optional: the endpoint upserts, keeping existing values for absent keys).
 */
export const LicensingBody = t.Object({
  license_type: t.Optional(t.String(),),
  custom_license_text: t.Optional(t.Nullable(t.String(),),),
  attribution: t.Optional(t.Nullable(t.String(),),),
  allow_derivatives: t.Optional(t.Boolean(),),
  allow_commercial: t.Optional(t.Boolean(),),
  share_alike: t.Optional(t.Boolean(),),
},);
