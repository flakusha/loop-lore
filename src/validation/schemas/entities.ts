// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Entity route validation schemas (actor-items, memories, lore, notes).
 */

import { t, } from "elysia";
import type { Static, } from "@sinclair/typebox";
import { Name, } from "./primitives";

// ── Entity routes (actor-items, memories, lore, notes) ─────

/** Entity audience scope — mirrors `MemoryScope` in `src/memory/types.ts`. */
export const EntityScopeSchema = t.UnionEnum(["character", "assistant", "world",],);
export type EntityScope = Static<typeof EntityScopeSchema>;

export const EntityCreateBody = t.Object({
  entityId: t.Optional(t.String({ minLength: 1, },),),
  type: t.Optional(t.String(),),
  name: t.Optional(Name,),
  title: t.Optional(t.String(),),
  content: t.Optional(t.String(),),
  // Constrained JSON object — matches project convention.
  data: t.Optional(t.Record(t.String(), t.Any(),),),
  pinned: t.Optional(t.Boolean(),),
  scope: t.Optional(EntityScopeSchema,),
},);

export const EntityUpdateBody = t.Object({
  name: t.Optional(Name,),
  content: t.Optional(t.String(),),
  type: t.Optional(t.String(),),
  data: t.Optional(t.Record(t.String(), t.Any(),),),
  pinned: t.Optional(t.Boolean(),),
  scope: t.Optional(EntityScopeSchema,),
},);
