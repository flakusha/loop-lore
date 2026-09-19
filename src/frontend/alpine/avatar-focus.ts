// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Avatar focus -> CSS object-position helper (TASK-001).
 *
 * Actors store `avatar_focus_x` / `avatar_focus_y` as percentages
 * (0 = left/top edge, 100 = right/bottom edge, 50/50 = exact center).
 * Applying the returned declaration to an `object-fit: cover` image keeps
 * the subject's focal point inside the cropped viewport.
 */

/** Percentage fallback when a focus value is missing or invalid. */
export const AVATAR_FOCUS_DEFAULT = 50;

/**
 * Clamp one focus percentage to the 0-100 CSS range; non-finite inputs
 * (null, undefined, NaN) fall back to the center default.
 * @param value
 */
function clampPercent(value: number | null | undefined,): number {
  if (typeof value !== "number" || !Number.isFinite(value,)) { return AVATAR_FOCUS_DEFAULT; }
  return Math.min(100, Math.max(0, value,),);
}

/**
 * Compute the `object-position` VALUE ("X% Y%") from an actor's avatar focus
 * percentages. Absent or invalid values yield exact centering (50/50).
 * @param focus - avatar_focus_x / avatar_focus_y percentages (0-100)
 */
export function avatarFocusPosition(
  focus: { focusX?: number | null; focusY?: number | null } = {},
): string {
  return `${clampPercent(focus.focusX,)}% ${clampPercent(focus.focusY,)}%`;
}

/**
 * Build a full CSS `object-position` declaration (for style attributes)
 * from an actor's avatar focus percentages.
 * @param focus - avatar_focus_x / avatar_focus_y percentages (0-100)
 */
export function avatarFocusStyle(
  focus: { focusX?: number | null; focusY?: number | null } = {},
): string {
  return `object-position: ${avatarFocusPosition(focus,)}`;
}
