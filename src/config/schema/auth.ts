// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/auth.ts — Authentication / session config type

/** */
export interface AuthConfig {
  /** true = remote multi-user auth required, false = demo/solo mode (skip auth) */
  required: boolean;
  /** Allow new user registration */
  registrationOpen: boolean;
  /** Idle session timeout in hours */
  sessionTimeoutHours: number;
  /** Max simultaneous sessions per user */
  maxSessionsPerUser: number;
  /** Demo username (auto-created when auth.required=false) */
  demoUsername: string;
  /** Auto-create sample data on first demo run */
  demoAutoSetup: boolean;
  /** Bootstrap admin username (multi-user mode). Set via config or AUTH_ADMIN_USERNAME env. */
  adminUsername?: string;
  /** Bootstrap admin password (multi-user mode). Env-only preferred; AUTH_ADMIN_PASSWORD. Never commit. */
  adminPassword?: string;
  /** HMAC-SHA256 secret for JWT signing. Required when auth.required=true. Env-only: AUTH_JWT_SECRET. */
  jwtSecret?: string;
  /**
   * HMAC secret for `Bun.CSRF` token issuance + verification. When unset,
   * falls back to `auth.jwtSecret`. Env-only: AUTH_CSRF_SECRET.
   * Required for production deployments; defaults in dev only.
   */
  csrfSecret?: string;
  /** JWT token expiry in seconds (default: 86400 = 24h) */
  jwtExpiresIn?: number;
  /**
   * Permit the sha256(token) lookup as a fallback when JWT verification fails.
   * Off by default — the opaque-token table is a pre-JWT-era compat surface
   * that authenticates any pre-existing token_hash row even when jwtSecret is
   * empty. Enable only for one-shot legacy migrations, then disable.
   * Env: AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK=1
   */
  legacyOpaqueTokenFallback?: boolean;
}
