// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Outfit × emotion selection ladder (algorithm v2, deterministic).
 *
 * When a context outfit is resolved, avatar choice walks this ladder in
 * order and stops at the first rung that yields a variant:
 *
 *  1. (outfit, emotion) — exact outfit × emotion variant
 *  2. (outfit, neutral) — same outfit, neutral emotion
 *  3. (default outfit, emotion) — character default outfit, when it
 *     differs from the resolved outfit
 *  4. (base/outfitless, emotion) — today's pre-wardrobe variants
 *     (`outfit_id IS NULL`), keeping emotion-only characters working
 *  5. base portrait — caller falls through to `resolveBaseAvatar`
 *
 * Within a rung, ties break deterministically: primary avatar first,
 * then ascending `sort_order` (input order is preserved).
 */
import type { Avatar, } from "../avatar-service/types";

/** Inputs for one ladder walk. */
export interface OutfitLadderInput {
  /** Resolved context outfit (chat > location > default). */
  outfitId: string;
  /** Character default outfit; may equal `outfitId` or be null. */
  defaultOutfitId?: string | null;
  /** Current emotion; neutral-preference applies when omitted. */
  emotion?: string;
}

/** Primary-first, then input (sort_order asc) pick. */
function pickOne(pool: Avatar[],): Avatar | null {
  return pool.find((a,) => a.isPrimary) ?? pool[0] ?? null;
}

function byEmotion(pool: Avatar[], emotion: string | undefined,): Avatar[] {
  if (!emotion) { return []; }
  return pool.filter((a,) => a.tags.emotion?.toLowerCase() === emotion);
}

function byNeutral(pool: Avatar[],): Avatar[] {
  return pool.filter((a,) => a.tags.emotion?.toLowerCase() === "neutral");
}

/**
 * Walk the outfit × emotion fallback ladder over an actor's avatars.
 *
 * Pure and deterministic: same inputs always produce the same avatar.
 * Returns null only when every rung misses — the caller then falls
 * through to the base portrait.
 * @param avatars
 * @param input
 * @returns void
 */
export function runOutfitLadder(
  avatars: Avatar[],
  input: OutfitLadderInput,
): Avatar | null {
  const emotion = input.emotion?.toLowerCase();
  const resolvedPool = avatars.filter((a,) => a.outfitId === input.outfitId);

  // Rung 1: exact (outfit, emotion); without an emotion, prefer the
  // outfit's neutral variant, then any variant of that outfit.
  if (emotion) {
    const hit = pickOne(byEmotion(resolvedPool, emotion,),);
    if (hit) { return hit; }
  } else {
    const neutral = pickOne(byNeutral(resolvedPool,),);
    if (neutral) { return neutral; }
    const any = pickOne(resolvedPool,);
    if (any) { return any; }
  }

  // Rung 2: (outfit, neutral) — only meaningful when neutral was not
  // already the rung-1 target.
  if (emotion && emotion !== "neutral") {
    const hit = pickOne(byNeutral(resolvedPool,),);
    if (hit) { return hit; }
  }

  // Rung 3: (default outfit, emotion) — when a distinct default exists.
  const defaultId = input.defaultOutfitId ?? null;
  if (defaultId && defaultId !== input.outfitId) {
    const defaultPool = avatars.filter((a,) => a.outfitId === defaultId);
    const hit = emotion
      ? pickOne(byEmotion(defaultPool, emotion,),) ?? pickOne(byNeutral(defaultPool,),)
      : pickOne(byNeutral(defaultPool,),) ?? pickOne(defaultPool,);

    if (hit) { return hit; }
  }

  // Rung 4: base/outfitless emotion variants (today's behavior).
  const basePool = avatars.filter((a,) => a.outfitId == null);
  const baseHit = emotion
    ? pickOne(byEmotion(basePool, emotion,),) ?? pickOne(byNeutral(basePool,),)
    : pickOne(byNeutral(basePool,),);

  if (baseHit) { return baseHit; }

  return null;
}
