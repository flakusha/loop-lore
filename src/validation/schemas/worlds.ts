// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World route validation schemas.
 */

import { t, } from "elysia";
import { Id, Name, WorldKindSchema, WorldVisibilitySchema, } from "./primitives";

// ── World routes ───────────────────────────────────────────

/** Opt-in flag: boolean or 0/1 (normalized to 0/1 by the handler). */
const Flag = t.Union([t.Boolean(), t.Integer({ minimum: 0, maximum: 1, },),],);

export const WorldCreateBody = t.Object({
  name: Name,
  description: t.Optional(t.String(),),
  lore: t.Optional(t.String(),),
  locationCount: t.Optional(t.Numeric({ minimum: 0, },),),
  kind: t.Optional(WorldKindSchema,),
  visibility: t.Optional(WorldVisibilitySchema,),
  rpgEnabled: t.Optional(Flag,),
  rpgDice: t.Optional(Flag,),
  rpgChecks: t.Optional(Flag,),
  rpgCombat: t.Optional(Flag,),
  rpgXp: t.Optional(Flag,),
  rpgLoot: t.Optional(Flag,),
  rpgQuests: t.Optional(Flag,),
},);

export const WorldUpdateBody = t.Object({
  name: t.Optional(Name,),
  description: t.Optional(t.String(),),
  lore: t.Optional(t.String(),),
  kind: t.Optional(WorldKindSchema,),
  visibility: t.Optional(WorldVisibilitySchema,),
  rpgEnabled: t.Optional(Flag,),
  rpgDice: t.Optional(Flag,),
  rpgChecks: t.Optional(Flag,),
  rpgCombat: t.Optional(Flag,),
  rpgXp: t.Optional(Flag,),
  rpgLoot: t.Optional(Flag,),
  rpgQuests: t.Optional(Flag,),
}, {
  // TASK-031: pass unknown keys through instead of silently stripping them
  // so the character/world boundary guard can reject misdirected
  // character-owned fields with 422 (the handler still writes only declared
  // fields).
  additionalProperties: true,
},);

export const WorldIdParams = t.Object({
  id: Id,
},);
