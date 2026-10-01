// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Request schemas for the ComfyUI builder routes (Track A): chain CRUD,
 * chain runs, and the graph validate endpoint. `workflow` stays
 * `Type.Unknown()` — it is validated by `validateGraph`, not TypeBox.
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

/** Graph validate body. */
export const GraphValidateBody = Type.Object({
  workflow: Type.Unknown(),
},);

/** */
export type ChainCreateBodyT = Static<typeof ChainCreateBody>;
/** */
export type ChainUpdateBodyT = Static<typeof ChainUpdateBody>;
/** */
export type ChainRunBodyT = Static<typeof ChainRunBody>;
