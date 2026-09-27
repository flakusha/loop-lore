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

export const NpcStateBody = t.Object({
  npc_id: t.String({ format: "uuid", },),
  state_key: t.String({ minLength: 1, },),
  state_value: t.Any(),
},);

export const LocationStateBody = t.Object({
  location_id: t.String({ format: "uuid", },),
  state_key: t.String({ minLength: 1, },),
  state_value: t.Any(),
},);

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
