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
  tags: t.Optional(t.String(),),
  personality: t.Optional(t.String(),),
  appearance: t.Optional(t.String(),),
  defaultOutfit: t.Optional(t.String(),),
  outfits: t.Optional(t.String(),),
  scenario: t.Optional(t.String(),),
  welcomeMessage: t.Optional(t.String(),),
  agentRole: t.Optional(t.String(),),
},);

export const ActorUpdateBody = t.Object({
  displayName: t.Optional(DisplayName,),
  contentRating: t.Optional(ContentRatingSchema,),
  description: t.Optional(t.String(),),
  systemPrompt: t.Optional(t.String(),),
  avatarAssetId: OptionalId,
  personality: t.Optional(t.String(),),
  appearance: t.Optional(t.String(),),
  defaultOutfit: t.Optional(t.String(),),
  outfits: t.Optional(t.String(),),
  welcomeMessage: t.Optional(t.String(),),
  mesExample: t.Optional(t.String(),),
  scenario: t.Optional(t.String(),),
  postHistoryInstructions: t.Optional(t.String(),),
  creatorNotes: t.Optional(t.String(),),
  creator: t.Optional(t.String(),),
  characterVersion: t.Optional(t.String(),),
  // Constrained JSON object — matches project convention (e.g. character-relations metadata).
  // Rejects top-level arrays/primitives while preserving freeform values.
  settings: t.Optional(t.Record(t.String(), t.Any(),),),
  /** Author growth toggle (epic-character-growth D1); dynamic (default) or static. */
  growthMode: t.Optional(t.Union([t.Literal("dynamic",), t.Literal("static",),],),),
  /** Opt-in LLM-assist pass (epic-character-growth D6); off by default. */
  llmAssistEnabled: t.Optional(t.Boolean(),),
  /** Avatar crop focus as percentages; clamped to 0-100 server-side (TASK-001). */
  avatarFocusX: t.Optional(t.Number(),),
  avatarFocusY: t.Optional(t.Number(),),
  /** Optimistic-concurrency version from the prior GET response. CHAR-1. */
  dataVersion: t.Optional(t.Integer({ minimum: 0, },),),
}, {
  // TASK-031: pass unknown keys through instead of silently stripping them
  // so the character/world boundary guard can reject misdirected
  // world-owned fields with 422 (the handler still writes only declared
  // fields).
  additionalProperties: true,
},);

export const ActorIdParams = t.Object({
  actorId: Id,
},);

/** Body for the admin approve/reject review decisions. `reason` is optional —
 * neither decision requires one — but bounded when present so an admin cannot
 * write an unbounded blob into the audit trail. */
export const ReviewDecisionBody = t.Object({
  reason: t.Optional(t.String({ maxLength: 1000, },),),
},);

export const ActorsQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1, },),),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 20, },),),
  type: t.Optional(ActorTypeSchema,),
},);
