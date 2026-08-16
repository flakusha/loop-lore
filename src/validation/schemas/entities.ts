// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Entity route validation schemas (actor-items, memories, lore, notes).
 */

import { t, } from "elysia";
import { Name, } from "./primitives";

// ── Entity routes (actor-items, memories, lore, notes) ─────

export const EntityCreateBody = t.Object({
  entityId: t.Optional(t.String({ minLength: 1, },),),
  type: t.Optional(t.String(),),
  name: t.Optional(Name,),
  title: t.Optional(t.String(),),
  content: t.Optional(t.String(),),
  data: t.Optional(t.Any(),),
  pinned: t.Optional(t.Boolean(),),
  scope: t.Optional(t.Union([t.Literal("character"), t.Literal("assistant"), t.Literal("world"),],),),
},);

export const EntityUpdateBody = t.Object({
  name: t.Optional(Name,),
  content: t.Optional(t.String(),),
  type: t.Optional(t.String(),),
  data: t.Optional(t.Any(),),
  pinned: t.Optional(t.Boolean(),),
  scope: t.Optional(t.Union([t.Literal("character"), t.Literal("assistant"), t.Literal("world"),],),),
},);
