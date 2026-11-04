// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Professions route schemas.
 *
 * TypeBox body/query/params schemas for the professions routes
 * (`professions.ts`). Extracted to keep the route module under the 250-line
 * ceiling (mirrors `skills-schemas.ts`).
 */

import { t, } from "elysia";
import { CraftingDiscipline, ProfessionBonusType, } from "../../db/enums-crafting";

export const createProfessionBody = t.Object({
  actorId: t.String(),
  worldId: t.Optional(t.String(),),
  discipline: t.Enum(CraftingDiscipline,),
  level: t.Optional(t.Number({ minimum: 1, maximum: 100, },),),
},);

export const professionXpBody = t.Object({
  amount: t.Number({ minimum: 1, },),
},);

export const professionSpecializeBody = t.Object({
  name: t.String({ minLength: 1, },),
  description: t.Optional(t.String(),),
  bonusType: t.Enum(ProfessionBonusType,),
  bonusValue: t.Number({ minimum: 0, },),
  requirementLevel: t.Optional(t.Number({ minimum: 1, maximum: 100, },),),
},);

export const professionIdParams = t.Object({
  id: t.String(),
},);

export const actorIdParams = t.Object({
  actorId: t.String(),
},);

export const professionsQuery = t.Object({
  worldId: t.Optional(t.String(),),
},);
