// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Request schemas for the RPG questions routes.
 */
import { t, } from "elysia";

/** Body for creating a question on a chat. */
export const createQuestionBody = t.Object({
  type: t.Union([
    t.Literal("dialogue",),
    t.Literal("action",),
    t.Literal("exploration",),
    t.Literal("combat",),
    t.Literal("custom",),
  ],),
  prompt: t.String({ minLength: 1, },),
  options: t.Array(
    t.Object({ id: t.String({ minLength: 1, },), text: t.String({ minLength: 1, },), },),
    { minItems: 1, },
  ),
  actorId: t.String({ minLength: 1, },),
  inputKind: t.Optional(
    t.Union([
      t.Literal("choice",),
      t.Literal("free_text",),
      t.Literal("numeric",),
    ],),
  ),
  minValue: t.Optional(t.Nullable(t.Number(),),),
  maxValue: t.Optional(t.Nullable(t.Number(),),),
  effect: t.Optional(
    t.Object({
      quest: t.Optional(
        t.Object({
          questId: t.String({ minLength: 1, },),
          progressDelta: t.Optional(t.Number(),),
          complete: t.Optional(t.Boolean(),),
        },),
      ),
      grantItemId: t.Optional(t.String({ minLength: 1, },),),
    },),
  ),
  timeLimit: t.Optional(t.Nullable(t.Number({ minimum: 1, },),),),
  requiredChoice: t.Optional(t.Number({ minimum: 1, },),),
},);

/** Body for answering a question: `optionId` for choice, `value` otherwise. */
export const answerQuestionBody = t.Object({
  optionId: t.Optional(t.String({ minLength: 1, },),),
  value: t.Optional(t.Union([t.String({ minLength: 1, },), t.Number(),],),),
},);
