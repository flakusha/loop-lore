/**
 * NPC Navigation route schemas.
 *
 * TypeBox body/query schemas for the NPC navigation routes
 * (`npc-navigation.ts`). Extracted to keep the route module under the 250L
 * ceiling.
 */

/* eslint-disable unicorn/max-nested-calls -- Elysia TypeBox schema nesting is inherent to framework */
import { t, } from "elysia";
import { MovementPattern, } from "../../rpg/npc-navigation";

export const stateQuery = t.Object({
  worldId: t.String(),
},);

const stateUpdates = t.Partial(
  t.Object({
    currentLocationId: t.Union([t.String(), t.Null(),],),
    targetLocationId: t.Union([t.String(), t.Null(),],),
    movementPattern: t.Enum(MovementPattern,),
    patrolRoute: t.Array(t.String(),),
    patrolIndex: t.Number(),
    wanderRadius: t.Number(),
    followTargetId: t.Union([t.String(), t.Null(),],),
    speed: t.Number(),
    metadata: t.Record(t.String(), t.Any(),),
  },),
);

export const updateStateBody = t.Object({
  worldId: t.String(),
  updates: stateUpdates,
},);

export const patternConfigSchema = t.Object({
  patrolRoute: t.Optional(t.Array(t.String(),),),
  wanderRadius: t.Optional(t.Number(),),
  followTargetId: t.Optional(t.String(),),
  speed: t.Optional(t.Number(),),
},);

export const patternBody = t.Object({
  worldId: t.String(),
  pattern: t.Enum(MovementPattern,),
  config: t.Optional(patternConfigSchema,),
},);

export const moveBody = t.Object({
  worldId: t.String(),
  targetLocationId: t.String(),
},);
