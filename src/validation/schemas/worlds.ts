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
  rpgSkills: t.Optional(Flag,),
},);

/**
 * Default-free `kind` for UPDATE bodies.
 *
 * `t.UnionEnum` bakes `default` into the compiled schema (its first member),
 * so Elysia's parse force-set an omitted `kind` to "rpg" — the handler's
 * `body.kind != null` guard could never see it as absent, and every partial
 * update silently reset the column. A plain literal union carries no default
 * (same remedy as `EntityScopeUpdateSchema` in ./entities.ts).
 */
const WorldKindUpdate = t.Union([t.Literal("rpg",), t.Literal("chat",),],);

/** Default-free `visibility` for UPDATE bodies — see {@link WorldKindUpdate}. */
const WorldVisibilityUpdate = t.Union([
  t.Literal("public",),
  t.Literal("unlisted",),
  t.Literal("private",),
],);

export const WorldUpdateBody = t.Object({
  name: t.Optional(Name,),
  description: t.Optional(t.String(),),
  lore: t.Optional(t.String(),),
  kind: t.Optional(WorldKindUpdate,),
  visibility: t.Optional(WorldVisibilityUpdate,),
  rpgEnabled: t.Optional(Flag,),
  rpgDice: t.Optional(Flag,),
  rpgChecks: t.Optional(Flag,),
  rpgCombat: t.Optional(Flag,),
  rpgXp: t.Optional(Flag,),
  rpgLoot: t.Optional(Flag,),
  rpgQuests: t.Optional(Flag,),
  rpgSkills: t.Optional(Flag,),
  // Autonomy pacing override blob (TASK-autonomy-config-surface). A JSON
  // object, a raw JSON string, or null to clear the world layer.
  autonomyConfig: t.Optional(t.Union([t.Record(t.String(), t.Unknown(),), t.String(), t.Null(),],),),
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
