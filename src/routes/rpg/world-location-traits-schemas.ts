// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World & Location Traits route schemas.
 *
 * TypeBox body/query schemas for the world & location trait routes
 * (`world-location-traits.ts`). Extracted to keep the route module under the
 * 250L ceiling.
 */

import { t, } from "elysia";

export const WorldTraitCategorySchema = t.Union([
  t.Literal("environmental",),
  t.Literal("cultural",),
  t.Literal("magical",),
  t.Literal("technological",),
  t.Literal("political",),
  t.Literal("economic",),
],);

export const actorIdQuery = t.Object({
  actorId: t.String(),
},);

export const worldTraitBody = t.Object({
  actor_id: t.String(),
  world_id: t.String(),
  trait_category: WorldTraitCategorySchema,
  trait_name: t.String({ minLength: 1, },),
  trait_value: t.String(),
},);

export const updateWorldTraitBody = t.Partial(
  t.Object({
    trait_category: WorldTraitCategorySchema,
    trait_name: t.String({ minLength: 1, },),
    trait_value: t.String(),
  },),
);

export const locationTraitBody = t.Object({
  actor_id: t.String(),
  location_id: t.String(),
  trait_name: t.String({ minLength: 1, },),
  trait_value: t.String(),
  bonus: t.Optional(t.Number(),),
  penalty: t.Optional(t.Number(),),
  effects: t.Optional(t.Record(t.String(), t.Any(),),),
  equipment_override: t.Optional(t.Record(t.String(), t.Any(),),),
},);

export const updateLocationTraitBody = t.Partial(
  t.Object({
    trait_name: t.String({ minLength: 1, },),
    trait_value: t.String(),
    bonus: t.Number(),
    penalty: t.Number(),
    effects: t.Record(t.String(), t.Any(),),
    equipment_override: t.Record(t.String(), t.Any(),),
  },),
);

export const idParams = t.Object({
  id: t.String(),
},);
