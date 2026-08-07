/**
 * World/story state route validation schemas.
 */

import { t, } from "elysia";

// ── Story states schemas ──────────────────────────────────

export const WorldStateCreateBody = t.Object({
  turnId: t.Optional(t.String(),),
  messageId: t.Optional(t.String(),),
  description: t.Optional(t.String(),),
},);

export const NpcStateBody = t.Object({
  npc_id: t.String({ format: "uuid", },),
  state_key: t.String({ minLength: 1, },),
  state_value: t.Any(),
},);

export const LocationStateBody = t.Object({
  location_id: t.String({ format: "uuid", },),
  state_key: t.String({ minLength: 1, },),
  state_value: t.Any(),
},);
