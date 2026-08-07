// ── NSFW Content Rating (Enforcement) ────────────────────────

/** 5-tier NSFW content rating */
export type NSFWContentRating =
  | "none" // No NSFW content
  | "soft" // Implied/suggestive
  | "moderate" // Explicit but not graphic
  | "explicit" // Graphic content
  | "extreme"; // Extreme/fetish content

/** Content rating enforcement context */
export interface NSFWContentRatingEnforcement {
  /** Current content rating setting */
  currentRating: NSFWContentRating;
  /** Maximum allowed rating */
  maxAllowedRating: NSFWContentRating;
  /** Whether content filtering is enabled */
  filteringEnabled: boolean;
  /** User override with warning accepted */
  userOverride: boolean;
}

/** Check if content rating is allowed */
export function isRatingAllowed(
  contentRating: NSFWContentRating,
  enforcement: NSFWContentRatingEnforcement,
): boolean {
  const ratingOrder: NSFWContentRating[] = ["none", "soft", "moderate", "explicit", "extreme",];
  const contentIndex = ratingOrder.indexOf(contentRating,);
  const maxIndex = ratingOrder.indexOf(enforcement.maxAllowedRating,);

  if (contentIndex <= maxIndex) { return true; }
  if (enforcement.userOverride && enforcement.filteringEnabled) { return true; }
  return false;
}
