// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW gate constants + pure rating helpers.
 */
import type { ContentRating, } from "../../db/enums";

/** NSFW content rating levels that require age verification. */
const NSFW_RATINGS: readonly ContentRating[] = [
  "nsfw_mild",
  "nsfw_moderate",
  "nsfw_intense",
  "nsfw_extreme",
] as const;

/** Minimum intimacy score required for NSFW encounters. */
const NSFW_INTIMACY_THRESHOLD = 40;

/**
 * Whether a content rating is considered NSFW.
 * @param rating
 */
export function isNsfwRating(rating: ContentRating,): boolean {
  return NSFW_RATINGS.includes(rating,);
}

/**
 * Calculate age from birth date string.
 * @param birthDate
 * @returns age in years, or null when birthDate is not a valid date
 */
export function calculateAge(birthDate: string,): number | null {
  const birth = new Date(birthDate,);
  if (Number.isNaN(birth.getTime(),)) { return null; }
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export { NSFW_INTIMACY_THRESHOLD, };
