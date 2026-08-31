// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * External Music URL Patterns
 *
 * Compiled regex patterns for detecting URLs from external music services.
 * @module regex/music-urls
 */

/** URL patterns for external music services */
export const EXTERNAL_MUSIC_PATTERNS: readonly RegExp[] = [
  /^https?:\/\/(www\.)?youtube\.com\/watch/,
  /^https?:\/\/youtu\.be\//,
  /^https?:\/\/(www\.)?spotify\.com\//,
  /^https?:\/\/(www\.)?soundcloud\.com\//,
  /^https?:\/\/(www\.)?bandcamp\.com\//,
] as const;
