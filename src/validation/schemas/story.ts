/**
 * Story / quest route validation schemas.
 */

import { t, } from "elysia";
import { Name, OptionalId, QuestTypeSchema, TurnTypeSchema, } from "./primitives";

// ── Story / Quest routes ───────────────────────────────────

export const StoryTurnCreateBody = t.Object({
  type: TurnTypeSchema,
  content: t.String({ minLength: 1, },),
  actorId: OptionalId,
},);

export const QuestCreateBody = t.Object({
  name: Name,
  type: t.Optional(QuestTypeSchema,),
  description: t.Optional(t.String(),),
},);
