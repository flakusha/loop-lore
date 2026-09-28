// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Wire shapes for `/api/v1/admin/comfyui-workflows`.
 *
 * These live beside the component rather than in `src/validation/schemas/`
 * because the route module owns the server-side half of the contract; the
 * frontend decodes the same shape with `parseOr` so a drift shows up as an
 * empty list in the admin tab instead of an untyped cast.
 */
import { Type, } from "@sinclair/typebox";

/** A stored workflow payload, as the detail endpoint returns it. */
export const WorkflowPayloadSchema = Type.Object({
  body: Type.Unknown(),
  category: Type.String(),
  parameters: Type.Array(Type.Unknown(),),
  requiredNodes: Type.Array(Type.String(),),
  loraSlots: Type.Optional(Type.Array(Type.Unknown(),),),
},);

/** One row as the list and detail endpoints serve it. */
export const WorkflowSummarySchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null(),],),
  model_family: Type.Union([Type.String(), Type.Null(),],),
  is_default: Type.String(),
  enabled: Type.String(),
  min_vram: Type.Union([Type.Number(), Type.Null(),],),
  lora_slots: Type.Unknown(),
  node_count: Type.Number(),
  category: Type.Union([Type.String(), Type.Null(),],),
  missing_nodes: Type.Union([Type.Array(Type.String(),), Type.Null(),],),
},);

/** `GET /api/v1/admin/comfyui-workflows` body. */
export const WorkflowListResponseSchema = Type.Object({
  workflows: Type.Array(WorkflowSummarySchema,),
  total: Type.Number(),
  comfyui_reachable: Type.Boolean(),
},);

/** `GET /api/v1/admin/comfyui-workflows/:id` body. */
export const WorkflowDetailResponseSchema = Type.Union([
  Type.Composite([
    WorkflowSummarySchema,
    Type.Object({
      payload: Type.Union([WorkflowPayloadSchema, Type.Null(),],),
    },),
  ],),
  Type.Null(),
],);
