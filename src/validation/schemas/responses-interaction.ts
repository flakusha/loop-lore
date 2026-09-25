// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Interaction parser response schemas (raw TypeBox).
 *
 * Mirrors `src/regex/action-parser.ts` — discriminated verb enum + typed
 * `Action` envelope used by affordance consumers downstream. Lives in a
 * sibling module so `responses.ts` stays under the 250-line size ceiling
 * (see `responses-admin.ts` for the same pattern).
 */

import { Type, } from "@sinclair/typebox";

/** Discriminated verb enum mirroring `src/regex/action-parser`. */
export const ActionVerb = Type.Union([
  Type.Literal("use"),
  Type.Literal("equip"),
  Type.Literal("unequip"),
  Type.Literal("drop"),
  Type.Literal("give"),
  Type.Literal("take"),
  Type.Literal("open"),
  Type.Literal("close"),
  Type.Literal("read"),
  Type.Literal("examine"),
  Type.Literal("attack"),
  Type.Literal("defend"),
  Type.Literal("talk"),
  Type.Literal("move"),
  Type.Literal("hide"),
  Type.Literal("search"),
],);

export const TargetRefSchema = Type.Object({
  kind: Type.Union([Type.Literal("item"), Type.Literal("actor"), Type.Literal("location"), Type.Literal("exit"),],),
  id: Type.Optional(Type.String(),),
  displayName: Type.String(),
},);

export const ActionSchema = Type.Object({
  verb: ActionVerb,
  target: Type.Optional(TargetRefSchema,),
  instrument: Type.Optional(TargetRefSchema,),
  agency_mode: Type.Union([Type.Literal("free"), Type.Literal("forced"), Type.Literal("blocked"), Type.Literal("skipped"),],),
  confidence: Type.Number(),
  parser_stage: Type.Union([Type.Literal("stage1"), Type.Literal("stage2"),],),
  raw: Type.Optional(Type.String(),),
},);
