// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/assets.ts — Asset storage config type

export interface AssetsConfig {
  enabled: boolean;
  uploadDir: string;
  maxFileSize: number;
  compression: boolean;
  /**
   * HMAC-SHA256 secret for signed asset URLs. Env-only: ASSETS_SIGNED_URL_SECRET.
   * Falls back to `auth.jwtSecret` when unset. Never commit.
   */
  signedUrlSecret?: string;
  /** Signed-URL lifetime in seconds (default: 900 = 15 min). */
  signedUrlExpirySeconds?: number;
}
