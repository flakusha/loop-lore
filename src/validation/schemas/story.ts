// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story / quest route validation schemas.
 */

import { t, } from "elysia";
import { Name, OptionalId, QuestCategorySchema, QuestTypeSchema, TurnTypeSchema, } from "./primitives";

// ── Story / Quest routes ───────────────────────────────────

export const StoryTurnCreateBody = t.Object({
  type: TurnTypeSchema,
  content: t.String({ minLength: 1, },),
  actorId: OptionalId,
},);

export const QuestCreateBody = t.Object({
  name: Name,
  type: t.Optional(QuestTypeSchema,),
  category: t.Optional(QuestCategorySchema,),
  description: t.Optional(t.String(),),
},);
