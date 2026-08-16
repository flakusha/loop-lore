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

export const QuestProgressBody = t.Object({
  progress: t.Number({ minimum: 0, },),
  status: t.Optional(t.String(),),
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
