// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Emotion-avatar regeneration validation schemas (Elysia TypeBox).
 *
 * Covers the actor-level re-roll endpoint
 * (`POST /actors/:actorId/emotion-avatars/regenerate`), which targets the
 * base (outfitless) emotion slots — unlike the outfit-scoped bodies in
 * `wardrobe.ts`.
 */
import { t, } from "elysia";

/**
 * Body for actor-level emotion-avatar regeneration.
 *
 * `replace: "slot"` re-points the emotion→avatar binding and cleans up the
 * old asset (single-slot re-roll semantics); `"append"` adds variants without
 * unbinding. `seedStrategy` is part of the endpoint contract but its
 * capture/override behavior is a separate open work item — accepted and
 * ignored for now.
 */
export const RegenerateEmotionAvatarsBody = t.Object({
  emotions: t.Optional(t.Array(t.String(),),),
  seedStrategy: t.Optional(t.String(),),
  replace: t.Union([t.Literal("slot",), t.Literal("append",),],),
  /** Base avatar to derive variants from; omitted = the actor's primary avatar. */
  baseAvatarId: t.Optional(t.String({ minLength: 1, },),),
},);

/** Params for actor-scoped emotion-avatar routes. */
export const EmotionAvatarActorParams = t.Object({
  actorId: t.String({ minLength: 1, },),
},);
