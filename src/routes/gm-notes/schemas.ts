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
},);

export const WhiteneoteBody = t.Object({
  type: t.UnionEnum([
    "narrative_direction",
    "character_motivation",
    "plot_thread",
    "tone",
    "pacing",
    "theme",
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
