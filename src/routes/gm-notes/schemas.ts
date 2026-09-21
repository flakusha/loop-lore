// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM Notes — shared validation schemas.
 */
import { t, } from "elysia";

const OptionalNullableString = t.Optional(t.Nullable(t.String(),),);

export const ShadowNoteBody = t.Object({
  type: t.UnionEnum([
    "foreshadowing",
    "consequence",
    "hidden_fact",
    "player_motivation",
    "world_secret",
    "narrative_hook",
  ],),
  content: t.String({ minLength: 1, },),
  // Optional TTL — when set, the note is filtered out of LLM injection
  // once `expiresAt` is in the past, and purged by a background sweep.
  expiresAt: OptionalNullableString,
  // Optional author_type — defaults to "user" at the DB layer for legacy
  // callers. "extracted" is reserved for the extraction pipeline writes
  // to `shadow_notes` (see chat/proactive/annotations.ts).
  authorType: t.Optional(
    t.UnionEnum(["user", "gm", "system", "extracted",],),
  ),
});

export const WhiteneoteBody = t.Object({
  type: t.UnionEnum([
    "narrative_direction",
    "character_motivation",
    "plot_thread",
    "tone",
    "pacing",
    "theme",
    "character_context",
    "world_state",
  ],),
  content: t.String({ minLength: 1, },),
  priority: t.Optional(t.Numeric({ minimum: 1, maximum: 10, default: 5, },),),
  scope: t.Optional(t.UnionEnum(["scene", "chapter", "session", "world",],),),
  expiresAt: OptionalNullableString,
},);

export const NoteIdParams = t.Object({
  id: t.String({ format: "uuid", },),
  noteId: t.String({ format: "uuid", },),
},);
