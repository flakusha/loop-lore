// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/safety.ts — Database safety guards

import { getLogger, } from "../../logger";
import type { Config, } from "../schema";
import { isNetworkFilesystem, } from "./fs";

/**
 * Validate database safety constraints.
 * Rejects SQLite for multi-instance deployments and warns on network filesystems.
 *
 * @throws {Error} When SQLite is used in an unsafe multi-instance configuration
 */
export function validateDatabaseSafety(config: Config,): void {
  const { db, } = config;
  const instanceCount = Number(process.env.INSTANCE_COUNT ?? "1",);
  const unsafeMultiInstance = process.env.UNSAFE_SQLITE_MULTIINSTANCE === "true";

  // ── Guard 1: Reject SQLite + multi-instance ──
  if (db.type === "sqlite" && instanceCount > 1) {
    throw new Error(
      `DATABASE SAFETY: SQLite backend is not safe with ${instanceCount} instances. ` +
        "SQLite uses file-level locking that corrupts data when multiple processes " +
        "write concurrently over a network filesystem. " +
        'Fix: Switch to Postgres (db.type = "postgres") or set INSTANCE_COUNT=1.',
    );
  }

  if (unsafeMultiInstance && db.type === "sqlite") {
    throw new Error(
      "DATABASE SAFETY: UNSAFE_SQLITE_MULTIINSTANCE=true is set but SQLite is configured. " +
        "This environment variable is a safety override that should only be used " +
        "during controlled migrations. Remove it or switch to Postgres.",
    );
  }

  // ── Guard 2: Warn on network filesystem ──
  if (db.type === "sqlite" && db.sqliteFilename && isNetworkFilesystem(db.sqliteFilename,)) {
    getLogger().child({ module: "config-safety", },).warn(
      `SQLite WAL path "${db.sqliteFilename}" appears to be on a network filesystem. ` +
        "SQLite over NFS/EFS is unreliable and may cause data corruption. " +
        "Mitigations: (1) move DB to local storage, (2) switch to Postgres, " +
        "(3) set UNSAFE_SQLITE_MULTIINSTANCE=true to suppress.",
    );
  }
}

/**
 * Minimum HMAC-SHA256 secret length when JWT auth is required. Below this,
 * tokens are trivially forgeable via brute-force / known-weak-key lists.
 */
export const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Validate auth safety constraints.
 *
 * When `auth.required = true` (multi-user mode), JWTs are signed with
 * `auth.jwtSecret` via HMAC-SHA256. An empty or short secret means any
 * attacker who learns the deployment uses JWTs (the loop-lore default)
 * can forge valid tokens for any user — including admin — without ever
 * touching the password store.
 *
 * This guard MUST run at config-load time (startup) so the server refuses
 * to boot in an insecure state. A runtime check on first /login is too
 * late: by then the admin bootstrap may have already happened and the
 * server is reachable on the network.
 *
 * Solo mode (`auth.required = false`, the default) skips the secret-length
 * check entirely — solo users are auto-authenticated and never see JWTs.
 *
 * @throws {Error} When auth is required but the JWT secret is missing or weak
 */
export function validateAuthSafety(config: Config,): void {
  const { auth, } = config;
  if (!auth.required) { return; }

  const secret = auth.jwtSecret ?? "";
  if (secret.length === 0) {
    throw new Error(
      "AUTH SAFETY: auth.required = true but auth.jwtSecret is empty. " +
        "Any JWT minted by the server would be forgeable by an attacker who " +
        "guesses (or learns) that the secret is empty. " +
        "Fix: set AUTH_JWT_SECRET env var to a random string of at least " +
        `${MIN_JWT_SECRET_LENGTH} characters, or disable multi-user auth ` +
        "(auth.required = false for solo mode).",
    );
  }
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `AUTH SAFETY: auth.required = true but auth.jwtSecret is only ` +
        `${secret.length} characters (minimum: ${MIN_JWT_SECRET_LENGTH}). ` +
        "Short HMAC-SHA256 secrets are brute-forceable. " +
        "Fix: regenerate AUTH_JWT_SECRET with `openssl rand -base64 48` or " +
        "an equivalent cryptographically secure random string.",
    );
  }

  // Warn (don't throw) on suspicious placeholder patterns. Placeholder
  // secrets are fine for local development but must be replaced before
  // exposing the server to any network.
  const suspiciousPatterns = [
    /^change.?me/i,
    /^secret$/i,
    /^password$/i,
    /^test/i,
    /^dev/i,
    /^demo$/i,
    /^example$/i,
    /^loop.?lore/i,
  ];
  if (suspiciousPatterns.some((re,) => re.test(secret,))) {
    getLogger().child({ module: "config-safety", },).warn(
      "AUTH SAFETY: auth.jwtSecret matches a known placeholder pattern. " +
        "This is fine for local development but MUST be replaced before " +
        "exposing the server to any network. Generate a random secret " +
        "with `openssl rand -base64 48` and set AUTH_JWT_SECRET.",
    );
  }
}
