// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW PII redaction helpers for admin telemetry.
 *
 * HMAC-SHA256 hashing for stable actor/chat correlation plus error-string
 * redaction so raw userId/chatId/error never appear in admin-facing
 * responses.
 *
 * Salt source: `AuthConfig.jwtSecret` (resolved at request time so secret
 * rotation propagates without restart). When no secret is configured,
 * hash helpers return null — callers MUST treat that as a fail-closed
 * signal and surface it in the response.
 */
import type { AuthConfig, } from "../config/schema/auth";

// ── Error category ──────────────────────────────────────────────────────

/** Error category enum replaces raw error strings in telemetry responses. */
export type ErrorCategory =
  | "timeout"
  | "rate_limit"
  | "schema_validation"
  | "auth_failure"
  | "other";

/** Pattern-based error categorisation keyed on the lower-cased error text. */
const ERROR_PATTERNS: Array<[RegExp, ErrorCategory]> = [
  [/timeout/i, "timeout",],
  [/rate.?limit|too.?many.?requests|429/i, "rate_limit",],
  [/schema|validation|parse|malformed|invalid.?json/i, "schema_validation",],
  [/auth|unauthorized|token|api.?key|key_id|nonce|401|403|forbidden|jwt|signature/i, "auth_failure",],
];

/** Map a raw error string to its ErrorCategory. */
export function categoriseError(error: string,): ErrorCategory {
  for (const [pattern, category,] of ERROR_PATTERNS) {
    if (pattern.test(error,)) { return category; }
  }
  return "other";
}

// ── HMAC helper ─────────────────────────────────────────────────────────

/**
 * HMAC-SHA256 hash of `value` using `secret`, truncated to the first
 * `byteCount` bytes then hex-encoded.
 *
 * Returns null when no secret is configured — callers must fail closed
 * (the response should still go out, but the hash will be null so admins
 * can see redaction was applied even without correlation).
 */
export async function hmacHex(value: string, secret: string, byteCount = 8,): Promise<string | null> {
  if (!secret) { return null; }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret,) as BufferSource,
    { name: "HMAC", hash: "SHA-256", },
    false,
    ["sign",],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value,) as BufferSource,
  );
  return Array.from(new Uint8Array(sig, 0, byteCount,),)
    .map((b,) => b.toString(16,).padStart(2, "0",),)
    .join("");
}

// ── ID hasher ───────────────────────────────────────────────────────────

/** Stable HMAC hash of a userId for admin telemetry. Returns 16-char hex or null. */
export async function actorHash(
  userId: string | null,
  authConfig: AuthConfig | undefined,
): Promise<string | null> {
  if (userId === null) { return null; }
  return hmacHex(userId, authConfig?.jwtSecret ?? "", 8,);
}

/** Stable HMAC hash of a chatId for admin telemetry. Returns 16-char hex or null. */
export async function chatHash(
  chatId: string | null,
  authConfig: AuthConfig | undefined,
): Promise<string | null> {
  if (chatId === null) { return null; }
  return hmacHex(chatId, authConfig?.jwtSecret ?? "", 8,);
}

// ── Error redaction ─────────────────────────────────────────────────────

/** Patterns stripped from error strings before admin exposure. */
const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  [/(?:bearer |token[=:]?\s*)[\w\-._~/+]+/gi, "[token]",],
  [/(?:api[_-]?key|secret|password)[=:]\s*[\w\-._~/+]+/gi, "[key_redacted]",],
  [/"key_id"\s*:\s*"\w+"/g, '"key_id":"[key_id_redacted]"',],
  [/"nonce"\s*:\s*"\w+"/g, '"nonce":"[nonce_redacted]"',],
  [/\b\d{10,}\b/g, "[numeric_id]",],
  [/https?:\/\/[^\s'"<>]+/g, "[url]",],
];

const MAX_ERROR_LEN = 200;

/**
 * Redact a raw error string:
 * - strips sensitive patterns (tokens, keys, nonces, numeric IDs, URLs)
 * - truncates to MAX_ERROR_LEN chars
 * - returns the ErrorCategory enum value so admins can still group failures
 */
export function redactError(
  raw: string | null,
): { category: ErrorCategory; text: string | null } {
  if (raw === null) { return { category: "other", text: null, }; }
  let text = raw;
  for (const [pattern, replacement,] of SENSITIVE_PATTERNS) {
    text = text.replace(pattern, replacement,);
  }
  return {
    category: categoriseError(text,),
    text: text.length > MAX_ERROR_LEN ? text.slice(0, MAX_ERROR_LEN,) : text,
  };
}
