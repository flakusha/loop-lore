/**
 * World route validation schemas.
 */

import { t, } from "elysia";
import { Id, Name, WorldKindSchema, WorldVisibilitySchema, } from "./primitives";

// ── World routes ───────────────────────────────────────────

export const WorldCreateBody = t.Object({
  name: Name,
  description: t.Optional(t.String(),),
  locationCount: t.Optional(t.Numeric({ minimum: 0, },),),
  kind: t.Optional(WorldKindSchema,),
  visibility: t.Optional(WorldVisibilitySchema,),
},);

export const WorldUpdateBody = t.Object({
  name: t.Optional(Name,),
  description: t.Optional(t.String(),),
  kind: t.Optional(WorldKindSchema,),
  visibility: t.Optional(WorldVisibilitySchema,),
},);

export const WorldIdParams = t.Object({
  id: Id,
},);
