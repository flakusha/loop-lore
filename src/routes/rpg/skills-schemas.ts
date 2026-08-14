/**
 * Skills route schemas.
 *
 * TypeBox body/query schemas for the skills routes (`skills.ts`). Extracted
 * to keep the route module under the 250L ceiling.
 */

/* eslint-disable unicorn/max-nested-calls -- Elysia TypeBox schema nesting is inherent to framework */
import { t, } from "elysia";
import { SkillCategory, } from "../../rpg/skills";

export const skillBody = t.Object({
  actorId: t.String(),
  worldId: t.Optional(t.String(),),
  name: t.String({ minLength: 1, },),
  category: t.Enum(SkillCategory,),
  description: t.Optional(t.String(),),
  prerequisites: t.Optional(t.Array(t.String(),),),
  metadata: t.Optional(t.Record(t.String(), t.Any(),),),
},);

export const updateSkillBody = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, },),
    description: t.Union([t.String(), t.Null(),],),
    category: t.Enum(SkillCategory,),
    specialization: t.Union([t.String(), t.Null(),],),
    metadata: t.Record(t.String(), t.Any(),),
  },),
);

export const xpBody = t.Object({
  xpAmount: t.Number({ minimum: 0, },),
},);

export const specializeBody = t.Object({
  specialization: t.String({ minLength: 1, },),
},);

export const checkPrerequisitesBody = t.Object({
  actorId: t.String(),
  prerequisites: t.Array(t.String(),),
  worldId: t.Optional(t.String(),),
},);

export const skillsQuery = t.Object({
  worldId: t.Optional(t.String(),),
  actorId: t.Optional(t.String(),),
},);

export const actorSkillsQuery = t.Object({
  worldId: t.Optional(t.String(),),
},);

export const categoryParams = t.Object({
  actorId: t.String(),
  category: t.Enum(SkillCategory,),
},);

export const actorParams = t.Object({
  actorId: t.String(),
},);
