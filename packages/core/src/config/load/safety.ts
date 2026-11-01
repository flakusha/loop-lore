// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/safety.ts — Database safety guards

import { getLogger, } from "@/logger";
import type { Config, } from "../schema";
import { isNetworkFilesystem, } from "./fs";

/**
 * Maximum tolerated skew (seconds) between the session-row idle timeout
 * (`auth.sessionTimeoutHours`) and the JWT lifetime (`auth.jwtExpiresIn`)
 * before boot warns about incoherent expiry configuration.
 */
export const SESSION_JWT_DIVERGENCE_TOLERANCE_SEC = 60;

/** Inputs for {@link sessionJwtDivergenceWarning}. Optional members mirror
 * the possibly-unset config section fields. */
export interface SessionJwtExpiryInputs {
  sessionTimeoutHours?: number;
  jwtExpiresIn?: number;
}

/**
 * Build the coherence warning for divergent session/JWT expiry knobs, or null
 * when they agree within {@link SESSION_JWT_DIVERGENCE_TOLERANCE_SEC}.
 *
 * The two settings express the same duration (session row TTL vs JWT exp);
 * skew yields mystery 401s (JWT outlives the row, or the row outlives the
 * JWT) with nothing pointing at the misconfiguration.
 * BUG-fix-auth-warn-when-sessiontimeouthours-and-jwtexpiresin-dive.
 * @param auth - the two auth expiry knobs from the loaded config
 * @returns the warning text, or null when the knobs are coherent
 */
export function sessionJwtDivergenceWarning(
  auth: SessionJwtExpiryInputs,
): string | null {
  const { sessionTimeoutHours, jwtExpiresIn, } = auth;
  // Partial/parsed configs may omit a knob; nothing to compare then.
  if (sessionTimeoutHours === undefined || jwtExpiresIn === undefined) {
    return null;
  }

  const sessionSec = sessionTimeoutHours * 3600;
  const diffSec = Math.abs(sessionSec - jwtExpiresIn,);
  if (diffSec <= SESSION_JWT_DIVERGENCE_TOLERANCE_SEC) { return null; }

  return "AUTH CONFIG: auth.sessionTimeoutHours and auth.jwtExpiresIn diverge: " +
    `sessionTimeoutHours = ${auth.sessionTimeoutHours}h (${sessionSec}s) vs ` +
    `jwtExpiresIn = ${auth.jwtExpiresIn}s (${diffSec}s apart). The session row ` +
    "TTL and the JWT lifetime should agree, or sessions will 401 while the " +
    "JWT still verifies (or vice versa) with no error pointing at the skew. " +
    "Fix: set both knobs to the same duration.";
}

/**
 * Validate database safety constraints.
 * Rejects SQLite for multi-instance deployments and warns on network filesystems.
 * @param config
 * @throws {Error} When SQLite is used in an unsafe multi-instance configuration
 * @returns {void}
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
 * True when `host` binds only the loopback interface: `localhost`,
 * `*.localhost`, the IPv4 loopback range 127.0.0.0/8, or `::1`. Wildcard
 * hosts (`0.0.0.0`, `::`) and LAN/remote hosts are NOT loopback.
 * @param host
 * @returns boolean
 */
export function isLoopbackHost(host: string,): boolean {
  // Strip IPv6 brackets: "[::1]" names the same loopback address as "::1".
  const h = host.trim().toLowerCase().replace(/^\[/, "",).replace(/\]$/, "",);

  if (h === "localhost" || h.endsWith(".localhost",) || h === "::1") { return true; }

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,);
  if (v4) { return Number(v4[1],) === 127; }

  return false;
}

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
 * @param config
 * @throws {Error} When auth is required but the JWT secret is missing or weak
 * @returns {void}
 */
export function validateAuthSafety(config: Config,): void {
  const { auth, } = config;

  // ── Coherence warning: session row TTL vs JWT lifetime ──
  // Fires in both solo and multi-user modes: skew between the two knobs
  // yields mystery 401s regardless of auth mode.
  const divergence = sessionJwtDivergenceWarning(auth,);
  if (divergence !== null) {
    getLogger().child({ module: "config-safety", },).warn(divergence,);
  }

  if (!auth.required) {
    // Solo mode auto-authenticates every request as the solo super-user
    // (authenticate.ts solo fallback), so a non-loopback bind exposes
    // admin-equivalent access to the entire network. Fail boot unless the
    // operator explicitly opted in (same escape-hatch convention as
    // UNSAFE_SQLITE_MULTIINSTANCE)
    // (BUG-harden-auth-refuse-or-loudly-gate-non-loopback-bind-while-au).
    // An empty host means "unset" — skip it; only explicit binds gate.
    if (
      config.server.host !== "" &&
      !isLoopbackHost(config.server.host,) &&
      process.env.UNSAFE_SOLO_REMOTE_BIND !== "true"
    ) {
      throw new Error(
        "AUTH SAFETY: auth.required = false (solo mode) but server.host = " +
          `"${config.server.host}" is not a loopback address. Every ` +
          "unauthenticated request would resolve to the solo super-user, exposing " +
          "admin-equivalent access to the network. Fix: bind to 127.0.0.1/localhost, " +
          "set auth.required = true, or set UNSAFE_SOLO_REMOTE_BIND=true to override.",
      );
    }

    return;
  }

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
