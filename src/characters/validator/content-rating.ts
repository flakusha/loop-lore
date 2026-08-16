// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/validator/content-rating.ts — Content-rating validators + age helpers

import type {
  CanonicalCharacter,
  ValidationError,
  ValidationWarning,
} from "../spec";
import { ContentRating, } from "../spec";
import { AGE_REQUIREMENTS, VALID_CONTENT_RATINGS, } from "./constants";

export function validateContentRating(
  character: CanonicalCharacter,
  errors: ValidationError[],
  _warnings: ValidationWarning[],
): void {
  const rating = character.content_rating;
  if (rating && !VALID_CONTENT_RATINGS.includes(rating,)) {
    errors.push({
      field: "content_rating",
      code: "INVALID_VALUE",
      message: `content_rating must be one of: ${VALID_CONTENT_RATINGS.join(", ",)}`,
      value: rating,
    },);
  }
}

/**
 * Check if a content rating is allowed for a given age.
 */
export function isContentRatingAllowed(
  rating: ContentRating,
  userAge: number | null,
): boolean {
  const requiredAge = AGE_REQUIREMENTS[rating];
  if (requiredAge === null) { return true; }
  if (userAge === null) { return false; }
  return userAge >= requiredAge;
}

/**
 * Get the minimum age required for a content rating.
 */
export function getMinimumAge(rating: ContentRating,): number | null {
  return AGE_REQUIREMENTS[rating];
}

/**
 * Filter content ratings to only those allowed for a given age.
 */
export function filterAllowedRatings(
  ratings: ContentRating[],
  userAge: number | null,
): ContentRating[] {
  if (userAge === null) { return [ContentRating.Sfw,]; }
  const allowed: ContentRating[] = [];
  for (const r of ratings) { if (isContentRatingAllowed(r, userAge,)) { allowed.push(r,); } }
  return allowed;
}
