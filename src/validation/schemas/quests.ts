// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quest route validation schemas.
 */

import { t, } from "elysia";
import { QuestCategorySchema, } from "./primitives";

// ── Quest schemas ─────────────────────────────────────────

export const QuestUpdateBody = t.Object({
  name: t.Optional(t.String(),),
  description: t.Optional(t.String(),),
  status: t.Optional(t.String(),),
},);

// Handler (src/routes/quests/handlers.ts handleProgress) and the quests view
// (advanceQuest) both speak `delta` (+ optional chatId / sourceMessageId);
// nothing sends or reads the old `progress` body field.
export const QuestProgressBody = t.Object({
  delta: t.Optional(t.Number({ minimum: 1, },),),
  chatId: t.Optional(t.String(),),
  sourceMessageId: t.Optional(t.String(),),
},);

export const QuestResponse = t.Object({
  id: t.String({ format: "uuid", },),
  name: t.String(),
  type: t.String(),
  category: QuestCategorySchema,
  status: t.String(),
  progress: t.Number(),
  created_at: t.String(),
  updated_at: t.String(),
},);
