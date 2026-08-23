// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor route validation schemas.
 */

import { t, } from "elysia";
import {
  ActorTypeSchema,
  AgentTypeSchema,
  ContentRatingSchema,
  DisplayName,
  Id,
  OptionalId,
} from "./primitives";

// ── Actor routes ───────────────────────────────────────────

export const ActorCreateBody = t.Object({
  displayName: DisplayName,
  actorType: t.Optional(ActorTypeSchema,),
  agentType: t.Optional(AgentTypeSchema,),
  contentRating: t.Optional(ContentRatingSchema,),
  description: t.Optional(t.String(),),
  systemPrompt: t.Optional(t.String(),),
  assetId: OptionalId,
},);

export const ActorUpdateBody = t.Object({
  displayName: t.Optional(DisplayName,),
  contentRating: t.Optional(ContentRatingSchema,),
  description: t.Optional(t.String(),),
  systemPrompt: t.Optional(t.String(),),
  avatarAssetId: OptionalId,
  personality: t.Optional(t.String(),),
  welcomeMessage: t.Optional(t.String(),),
  mesExample: t.Optional(t.String(),),
  scenario: t.Optional(t.String(),),
  postHistoryInstructions: t.Optional(t.String(),),
  creatorNotes: t.Optional(t.String(),),
  creator: t.Optional(t.String(),),
  characterVersion: t.Optional(t.String(),),
  settings: t.Optional(t.Any(),),
  /** Optimistic-concurrency version from the prior GET response. CHAR-1. */
  dataVersion: t.Optional(t.Integer({ minimum: 0, },),),
},);

export const ActorIdParams = t.Object({
  actorId: Id,
},);

export const ActorsQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1, },),),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 20, },),),
  type: t.Optional(ActorTypeSchema,),
},);
