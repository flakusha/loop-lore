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

// ── LoreSubject ─────────────────────────────────────────────────────────────

/**
 * Subject kinds recognized by the audience-resolution rules
 * (docs/spec/lore.md §3.2). Mirrors `KNOWN_SUBJECT_KINDS` in promote-lore.ts.
 */
export const LoreSubjectKindSchema = t.UnionEnum([
  "world",
  "location",
  "profession",
  "race",
  "faction",
  "item",
],);

/** Base subject with kind discriminator and optional location selector. */
export const LoreSubjectBaseSchema = t.Object({
  kind: LoreSubjectKindSchema,
});

export const LoreSubjectSchema = t.Union([
  // world / faction / item subjects carry no extra fields
  t.Intersect([
    LoreSubjectBaseSchema,
    t.Object({ kind: t.Literal("world",), }),
  ]),
  t.Intersect([
    LoreSubjectBaseSchema,
    t.Object({ kind: t.Literal("faction",), }),
  ]),
  t.Intersect([
    LoreSubjectBaseSchema,
    t.Object({ kind: t.Literal("item",), }),
  ]),
  // location subject: optional locationId
  t.Intersect([
    LoreSubjectBaseSchema,
    t.Object({
      kind: t.Literal("location",),
      locationId: t.Optional(t.String({ format: "uuid", },),),
    }),
  ]),
  // profession subject: required profession string
  t.Intersect([
    LoreSubjectBaseSchema,
    t.Object({
      kind: t.Literal("profession",),
      profession: t.String({ minLength: 1, maxLength: 255, },),
    }),
  ]),
  // race subject: required race string
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

/** Position of a lore entry in the narrative rendering order. */
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
  position: t.Optional(
    t.UnionEnum(["before_char", "after_char", "in_char",],),
  ),
  insertion_order: t.Optional(t.Integer({ minimum: 0, },),),
  priority: t.Optional(t.Integer({ minimum: -999, maximum: 999, },),),
  cooldown_seconds: t.Optional(t.Integer({ minimum: 0, },),),
});
