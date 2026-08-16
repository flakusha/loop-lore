// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Content Rating ────────────────────────────────────────
export const ContentRating = {
  Sfw: "sfw",
  NsfwMild: "nsfw_mild",
  NsfwModerate: "nsfw_moderate",
  NsfwIntense: "nsfw_intense",
  NsfwExtreme: "nsfw_extreme",
} as const;
export type ContentRating = (typeof ContentRating)[keyof typeof ContentRating];

// ── Licensing ─────────────────────────────────────────────
export const LicenseType = {
  Cc0: "cc0",
  CcBy: "cc_by",
  CcBySa: "cc_by_sa",
  CcByNc: "cc_by_nc",
  CcByNcSa: "cc_by_nc_sa",
  Proprietary: "proprietary",
  Custom: "custom",
} as const;
export type LicenseType = (typeof LicenseType)[keyof typeof LicenseType];

// ── Character Visibility Override (admin) ──────────────────
export const VisibilityOverride = {
  None: "none",
  Private: "private",
  Unlisted: "unlisted",
  Public: "public",
} as const;
export type VisibilityOverride = (typeof VisibilityOverride)[keyof typeof VisibilityOverride];
