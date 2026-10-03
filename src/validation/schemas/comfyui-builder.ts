// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Request schemas for the ComfyUI builder routes (Track A): chain CRUD,
 * chain runs, and the graph validate endpoint. The validate body's
 * `workflow` is bounded by node count only; node *shape* is checked by
 * `validateGraph`, not TypeBox.
 */
import { type Static, Type, } from "@sinclair/typebox";

/** One step of a builder chain. */
export const ChainStepSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 64, },),
  templateId: Type.String({ minLength: 1, maxLength: 200, },),
  params: Type.Record(
    Type.String(),
    Type.Union([Type.String(), Type.Number(), Type.Boolean()],),
  ),
});

/** Chain create body. */
export const ChainCreateBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200, },),
  description: Type.Optional(Type.Union([Type.String(), Type.Null()],),),
  steps: Type.Array(ChainStepSchema, { maxItems: 100, },),
},);

/** Chain update body — every field optional. */
export const ChainUpdateBody = Type.Partial(ChainCreateBody,);

/** Chain run start body. */
export const ChainRunBody = Type.Object({
  chainId: Type.String({ minLength: 1, maxLength: 200, },),
  chatId: Type.Optional(Type.String({ maxLength: 64, },),),
  messageId: Type.Optional(Type.String({ maxLength: 64, },),),
},);

/**
 * Node-count ceiling for the graph validate endpoint, matching the
 * `steps` cap on `ChainCreateBody` above. A real ComfyUI workflow is tens
 * of nodes; this exists only to stop an unbounded admin body.
 */
const MAX_WORKFLOW_NODES = 100;

/**
 * Graph validate body. Both forms `validateGraph` accepts are bounded:
 * the node record by key count, the node array by length. Node *shape*
 * stays unvalidated here — `validateGraph` reports those as issues.
 */
export const GraphValidateBody = Type.Object({
  workflow: Type.Union([
    Type.Record(Type.String(), Type.Unknown(), { maxProperties: MAX_WORKFLOW_NODES, },),
    Type.Array(Type.Unknown(), { maxItems: MAX_WORKFLOW_NODES, },),
  ],),
},);

/** */
export type ChainCreateBodyT = Static<typeof ChainCreateBody>;
/** */
export type ChainUpdateBodyT = Static<typeof ChainUpdateBody>;
/** */
export type ChainRunBodyT = Static<typeof ChainRunBody>;
