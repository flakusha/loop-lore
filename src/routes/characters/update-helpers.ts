// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeJsonParse, } from "../../utils";

/**
 * Clamp an avatar focus percentage to the 0-100 CSS `object-position` range.
 * Validation rejects non-numbers (422); numeric values outside the range are
 * clamped rather than rejected so permissive clients still save a sane crop.
 * @param value
 */
export function clampFocusPercent(value: unknown,): number {
  const n = typeof value === "number" ? value : Number(value,);
  if (!Number.isFinite(n,)) { return 50; }
  return Math.min(100, Math.max(0, n,),);
}

/**
 * Reject partial updates that carry an internally inconsistent wardrobe pair.
 * Single-half updates merge with the stored row: a defaultOutfit-only PUT
 * validates against existing outfits (and vice versa). Fully untouched
 * wardrobe (neither half in body nor stored) stays valid so displayName-only
 * PUTs on legacy/skeletal rows never fail.
 * @param body - Raw request body (presence check)
 * @param actor - Stored actor row (merge source for the untouched half)
 * @param actor.outfits - stored outfits JSON
 * @param actor.default_outfit - stored default outfit
 * @returns Error message, or null when the merged wardrobe stays valid
 */
export function rejectClearedCharacterFields(
  body: Record<string, unknown>,
  actor: { outfits?: string | null; default_outfit?: string | null },
): string | null {
  const hasOutfits = "outfits" in body;
  const hasDefault = "defaultOutfit" in body;
  if (!hasOutfits && !hasDefault) { return null; }
  const outfitsValue = hasOutfits && typeof body.outfits === "string" ? body.outfits : actor.outfits ?? null;
  const defValue = hasDefault && typeof body.defaultOutfit === "string"
    ? body.defaultOutfit
    : actor.default_outfit ?? null;
  if (typeof outfitsValue !== "string" || outfitsValue.trim() === "") {
    return "At least one outfit is required";
  }
  if (typeof defValue !== "string" || defValue.trim() === "") {
    return "default_outfit is required";
  }
  const parsedResult = safeJsonParse<unknown>(outfitsValue,);
  if (!parsedResult.ok) { return "outfits must be valid JSON"; }
  const parsed = parsedResult.value;
  if (!Array.isArray(parsed,) || parsed.length === 0) {
    return "At least one outfit is required";
  }
  const ids = new Set<string>();
  for (const o of parsed) {
    const idValue = (o as { id?: unknown } | null)?.id;
    if (typeof idValue !== "string" || idValue === "") {
      return "Each outfit must have a non-empty id";
    }
    if (ids.has(idValue,)) {
      return `Duplicate outfit id "${idValue}"`;
    }
    ids.add(idValue,);
  }
  const defId = defValue as string;
  if (!ids.has(defId,)) {
    return `default_outfit "${defId}" must match an outfits[].id`;
  }
  return null;
}
