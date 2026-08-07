/**
 * Story items route validation schemas.
 */

import { t, } from "elysia";

// ── Story items schemas ───────────────────────────────────

export const StoryItemInstanceBody = t.Object({
  itemId: t.String({ format: "uuid", },),
  locationId: t.Optional(t.String({ format: "uuid", },),),
  ownerActorId: t.Optional(t.String({ format: "uuid", },),),
  quantity: t.Optional(t.Number({ minimum: 1, },),),
},);

export const StoryItemResponse = t.Object({
  id: t.String({ format: "uuid", },),
  world_id: t.String(),
  item_id: t.String(),
  quantity: t.Number(),
  visibility: t.String(),
  created_at: t.String(),
},);
