// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lore validation schemas.
 *
 * TypeBox schemas for structured lore entry audience scopes and lore entries
 * created via the `/create` command. Used by route handlers and confirmation
 * endpoints to validate incoming payloads.
 */
import { t, } from "elysia";
import { LorePositionSchema, } from "./primitives";

// ── LoreSubject ─────────────────────────────────────────────────────────────

/** Subject kinds recognized by the audience-resolution rules (docs/spec/lore.md §3.2). */
export const LoreSubjectKindSchema = t.UnionEnum([
  "world",
  "location",
  "profession",
  "race",
],);

/** Base subject with kind discriminator. */
export const LoreSubjectBaseSchema = t.Object({
  kind: LoreSubjectKindSchema,
});

export const LoreSubjectSchema = t.Union([
  // world subjects carry no extra fields
  t.Intersect([
    LoreSubjectBaseSchema,
    t.Object({ kind: t.Literal("world",), }),
  ]),
  // location subject: required UUID locationId
  t.Intersect([
    LoreSubjectBaseSchema,
    t.Object({
      kind: t.Literal("location",),
      locationId: t.String({ format: "uuid", },),
    }),
  ]),
  // profession subject: required non-empty profession string
  t.Intersect([
    LoreSubjectBaseSchema,
    t.Object({
      kind: t.Literal("profession",),
      profession: t.String({ minLength: 1, maxLength: 255, },),
    }),
  ]),
  // race subject: required non-empty race string
  t.Intersect([
    LoreSubjectBaseSchema,
    t.Object({
      kind: t.Literal("race",),
      race: t.String({ minLength: 1, maxLength: 255, },),
    }),
  ]),
],);

/** Audience scope: optional subject + optional requires_presence flag. */
export const LoreScopeSchema = t.Object({
  subject: t.Optional(LoreSubjectSchema,),
  requires_presence: t.Optional(t.Boolean(),),
});

// ── LoreEntry ───────────────────────────────────────────────────────────────

/** A single structured lore entry created via the `/create` command. */
export const LoreEntrySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255, },),
  content: t.String({ minLength: 1, },),
  keys: t.Optional(
    t.Array(t.String({ maxLength: 100, },), { maxItems: 5, },),
  ),
  subject: t.Optional(LoreSubjectSchema,),
  requires_presence: t.Optional(t.Boolean(),),
  constant: t.Optional(t.Boolean(),),
  selective: t.Optional(t.Boolean(),),
  position: t.Optional(LorePositionSchema,),
  insertion_order: t.Optional(t.Integer({ minimum: 0, },),),
  priority: t.Optional(t.Integer({ minimum: -999, maximum: 999, },),),
  cooldown_seconds: t.Optional(t.Integer({ minimum: 0, },),),
});
