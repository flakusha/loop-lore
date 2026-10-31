// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "elysia";
import {
  ContentIntensitySchema,
  IntimacyActionTypeSchema,
  NarrativeStyleSchema,
  NsfwEncounterTypeSchema,
  SeductionSkillCategorySchema,
} from "../db-schemas";


export const NsfwIntimacyActionBody = t.Object({
  chatId: t.Optional(t.Nullable(t.String({ minLength: 1, },),),),
  actorId: t.String({ minLength: 1, },),
  targetActorId: t.String({ minLength: 1, },),
  worldId: t.Optional(t.Nullable(t.String({ minLength: 1, },),),),
  actionId: t.String({ minLength: 1, maxLength: 128, },),
  actionName: t.String({ minLength: 1, maxLength: 128, },),
  actionType: IntimacyActionTypeSchema,
  delta: t.Number(),
  minIntimacy: t.Optional(t.Number(),),
  requiresConsent: t.Optional(t.Boolean(),),
  context: t.Optional(t.String({ maxLength: 4096, },),),
},);

export const NsfwSeductionAttemptBody = t.Object({
  chatId: t.Optional(t.Nullable(t.String({ minLength: 1, },),),),
  actorId: t.String({ minLength: 1, },),
  targetId: t.String({ minLength: 1, },),
  skillCategory: SeductionSkillCategorySchema,
  approach: t.String({ minLength: 1, maxLength: 512, },),
  worldId: t.Optional(t.Nullable(t.String({ minLength: 1, },),),),
  reputationTier: t.Optional(t.String({ maxLength: 64, },),),
  delta: t.Optional(t.Number(),),
  source: t.Optional(t.String({ maxLength: 128, },),),
},);

export const NsfwEncounterCreateBody = t.Object({
  chatId: t.Optional(t.Nullable(t.String({ minLength: 1, },),),),
  actorId: t.String({ minLength: 1, },),
  worldId: t.Optional(t.Nullable(t.String({ minLength: 1, },),),),
  locationId: t.Optional(t.Nullable(t.String({ minLength: 1, },),),),
  encounterType: t.Optional(NsfwEncounterTypeSchema,),
  intensity: t.Optional(ContentIntensitySchema,),
  narrativeStyle: t.Optional(NarrativeStyleSchema,),
  participants: t.Array(t.String({ minLength: 1, },), { minItems: 1, maxItems: 16, },),
  contentTags: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 64, },), { maxItems: 32, },),),
},);
