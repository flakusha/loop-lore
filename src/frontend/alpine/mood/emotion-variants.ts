// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure emotion-variant lookup core for the mood avatar resolver.
 *
 * Zero imports — no browser or Alpine dependencies — so both the Alpine
 * state object (`mood/avatars.ts`) and backend suites (the emotion pipeline
 * integration test) share the exact → neutral → first walk without dragging
 * the browser-bound module graph into the backend project.
 */

/** One actor's emotion-tagged avatar rows, as the FE resolver consumes them. */
export interface EmotionVariant {
  emotion: string;
  avatarId: string;
  assetId: string;
}

/**
 * Reduce raw avatar rows to the resolver's emotion-variant list.
 * @param rows - Raw `/actors/:id/avatars` rows (camelCase on the wire).
 * @returns Emotion-tagged variants only, in server order.
 */
export function emotionVariantsOf(rows: unknown,): EmotionVariant[] {
  if (!Array.isArray(rows,)) { return []; }
  const variants: EmotionVariant[] = [];
  for (const row of rows) {
    const candidate = row as {
      id?: unknown;
      tags?: { emotion?: unknown } | null;
      assetId?: unknown;
      asset_id?: unknown;
    };

    if (typeof candidate.tags?.emotion !== "string") { continue; }
    // The list endpoint serializes camelCase `assetId`; tolerate a snake_case
    // row so hand-built fixtures keep resolving.
    const assetId = candidate.assetId ?? candidate.asset_id;
    if (typeof candidate.id !== "string" || typeof assetId !== "string") { continue; }
    variants.push({ emotion: candidate.tags.emotion, avatarId: candidate.id, assetId, },);
  }

  return variants;
}

/**
 * Exact → neutral → first walk shared by the per-actor and legacy paths.
 * Pure per-message lookup (no mood-global mutation).
 * @param variants - The actor's emotion variants.
 * @param emotion - The message's emotion.
 * @returns The matching asset id, or undefined.
 */
export function pickEmotionAsset(variants: EmotionVariant[], emotion: string | null | undefined,): string | undefined {
  if (!emotion) { return undefined; }
  return variants.find((variant,) => variant.emotion === emotion)?.assetId ??
    variants.find((variant,) => variant.emotion === "neutral")?.assetId ??
    variants[0]?.assetId;
}
