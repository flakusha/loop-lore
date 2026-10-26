// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World/story state route validation schemas.
 */

import { t, } from "elysia";

// ── Story states schemas ──────────────────────────────────

export const WorldStateCreateBody = t.Object({
  turnId: t.Optional(t.String(),),
  messageId: t.Optional(t.String(),),
  description: t.Optional(t.String(),),
},);

// The PUT handlers read these exact fields (handlers.ts intFields/strFields/
// jsonFields + locationId); the schema mirrors them so an unrelated body
// (e.g. the old state_key/state_value shape) is rejected with 422 instead of
// silently no-oping while still bumping updated_at.
export const NpcStateBody = t.Object({
  health: t.Optional(t.Integer(),),
  mentalState: t.Optional(t.String(),),
  knowledge: t.Optional(t.Any(),),
  relationships: t.Optional(t.Any(),),
  schedule: t.Optional(t.Any(),),
  locationId: t.Optional(t.String({ format: "uuid", },),),
}, { minProperties: 1, },);

// handleLocationState reads description_override/atmosphere/time_of_day/
// weather strings and npcsPresent/itemsAvailable/hazards JSON payloads.
export const LocationStateBody = t.Object({
  description_override: t.Optional(t.String(),),
  atmosphere: t.Optional(t.String(),),
  time_of_day: t.Optional(t.String(),),
  weather: t.Optional(t.String(),),
  npcsPresent: t.Optional(t.Any(),),
  itemsAvailable: t.Optional(t.Any(),),
  hazards: t.Optional(t.Any(),),
}, { minProperties: 1, },);

// ── Game state (2D canvas) schemas ────────────────────────

/** Entity token on the tactical grid. */
export const GameStateEntitySchema = t.Object({
  id: t.String({ minLength: 1, },),
  name: t.String({ minLength: 1, },),
  kind: t.Union([
    t.Literal("pc",),
    t.Literal("npc",),
    t.Literal("enemy",),
    t.Literal("object",),
  ],),
  x: t.Integer(),
  y: t.Integer(),
  color: t.Optional(t.String(),),
  label: t.Optional(t.String(),),
},);

/** Item marker on the tactical grid. */
export const GameStateItemSchema = t.Object({
  id: t.String({ minLength: 1, },),
  name: t.String({ minLength: 1, },),
  x: t.Integer(),
  y: t.Integer(),
},);

/**
 * Spatial snapshot of the scene, emitted by the LLM in a fenced
 * ```game-state JSON block. Coordinates are integer cells, origin top-left.
 */
export const GameStateSchema = t.Object({
  grid: t.Object({
    width: t.Integer({ minimum: 1, },),
    height: t.Integer({ minimum: 1, },),
  },),
  entities: t.Array(GameStateEntitySchema,),
  items: t.Optional(t.Array(GameStateItemSchema,),),
  caption: t.Optional(t.String(),),
},);

/** Per-entity movement between two persisted states. */
export const GameStateMovementSchema = t.Object({
  entityId: t.String({ minLength: 1, },),
  from: t.Object({ x: t.Integer(), y: t.Integer(), },),
  to: t.Object({ x: t.Integer(), y: t.Integer(), },),
},);

/** Diff of latest vs previous persisted state for the chat. */
export const GameStateAnalysisSchema = t.Object({
  movements: t.Array(GameStateMovementSchema,),
  added: t.Array(t.String(),),
  removed: t.Array(t.String(),),
  caption: t.Optional(t.String(),),
},);
