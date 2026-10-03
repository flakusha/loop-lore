// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-user blind-index key (`users.encryption_secret`).
 *
 * `deriveSearchTokens` (src/search/encrypted-tokens.ts) HMACs every query
 * word with this secret to build the blind tokens stored in
 * `message_search_tokens`. Without a per-user key the `token` search tier
 * has nothing to derive with, so the encrypted-search path is dead code.
 *
 * Same shape as the actor key at src/crypto/actor-keys.ts:108 — 32 bytes
 * from the CSPRNG, hex-encoded for the TEXT column. `password_hash` is
 * deliberately NOT the source: a password rotation must not invalidate every
 * stored token, and the two domains must stay independent
 * (BUG-jwtsecret-reused-across-three-security-domains).
 */

/** Secret length in bytes (256-bit HMAC key). */
export const ENCRYPTION_SECRET_BYTES = 32;

/** Hex chars emitted per byte — the column stores hex, not base64. */
const HEX_PER_BYTE = 2;

/** Matches one ASCII hex digit, either case. */
const HEX_DIGIT = /^[0-9a-fA-F]$/;

/**
 * Generate a fresh 32-byte per-user secret as lowercase hex (64 chars).
 *
 * Never deterministic and never derived from an existing secret: a
 * predictable key would let anyone holding the DB compute the blind tokens
 * offline and confirm guessed words.
 * @returns 64-char hex string, safe to store directly in the TEXT column.
 * @example
 * ```ts
 * const secret = generateEncryptionSecret();
 * await db.updateTable("users").set({ encryption_secret: secret }).execute();
 * ```
 */
export function generateEncryptionSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ENCRYPTION_SECRET_BYTES,),);
  let hex = "";
  for (const byte of bytes) { hex += byte.toString(16,).padStart(HEX_PER_BYTE, "0",); }
  return hex;
}

/**
 * True when a stored `users.encryption_secret` is usable as an HMAC key.
 *
 * Empty string, NULL, and short/odd-length values are all rejected —
 * `deriveSearchTokens` throws on an empty key, so a malformed row would turn
 * a search into a 500 instead of "no encrypted hits".
 * @param secret - raw column value (may be null).
 * @returns true only for a full-length hex secret.
 */
export function isUsableEncryptionSecret(secret: string | null,): boolean {
  if (secret === null || secret.length !== ENCRYPTION_SECRET_BYTES * HEX_PER_BYTE) { return false; }
  return [...secret,].every((char,) => HEX_DIGIT.test(char,));
}
