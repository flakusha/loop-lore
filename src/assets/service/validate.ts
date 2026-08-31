// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — input validation
 */

/**
 * Validate file size against config limit.
 * @param sizeBytes
 * @param maxSize
 */
export function validateFileSize(sizeBytes: number, maxSize: number,): string | null {
  if (sizeBytes > maxSize) {
    const maxMb = (maxSize / 1_048_576).toFixed(0,);
    return `File too large. Maximum size is ${maxMb} MB.`;
  }
  return null;
}

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "audio/",
  "video/",
  "application/pdf",
  "text/plain",
  "application/json",
];

const BLOCKED_MIME_TYPES = ["image/svg+xml",];

/**
 * Validate MIME type is allowed. Active formats (SVG) are rejected outright —
 * asset bytes are served from the app origin and must stay inert.
 * @param mime
 */
export function validateMimeType(mime: string,): string | null {
  const lowered = mime.toLowerCase();
  if (BLOCKED_MIME_TYPES.includes(lowered,)) {
    return `Unsupported file type: ${mime}`;
  }
  const allowed = ALLOWED_MIME_PREFIXES.some((prefix,) => lowered.startsWith(prefix,));
  if (!allowed) { return `Unsupported file type: ${mime}`; }
  return null;
}
