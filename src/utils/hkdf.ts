// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * HKDF-SHA256 domain separation helper.
 *
 * One secret (e.g. `auth.jwtSecret`) may be reused across multiple security
 * domains — JWT MAC, asset signed-URL HMAC, PII pseudonymization salt. When
 * the same underlying key material is fed into two different MAC algorithms
 * or two different message spaces, an attacker who recovers one signature can
 * attempt cross-protocol forgery. HKDF with a domain-specific `info` string
 * gives every consumer a cryptographically independent subkey, so a leak in
 * one domain does not cross over into another.
 *
 * SECURITY (BUG-jwtsecret-reused-across-three-security-domains):
 *   Wrap any consumer of a shared secret with `domainKey(secret, info, 32)`.
 *   The `info` argument is a versioned, scoped identifier — never reuse it
 *   across two consumers. The fixed prefix `"loop-lore/v1/"` prevents
 *   collisions with other apps that happen to pick the same string.
 *
 * Output is a uniformly random byte string of the requested length. Callers
 * pass it to `subtle.importKey(..., { name: "HMAC", hash: "SHA-256" })` or use
 * it directly as the salt/keying material for AES-GCM.
 *
 * Reference: RFC 5869 (HKDF).
 */

const VERSIONED_PREFIX = "loop-lore/v1/";

/**
 * Derive a domain-separated 256-bit subkey from a high-entropy input secret
 * using HKDF-SHA256.
 *
 * @param secret - The high-entropy shared input (e.g. `auth.jwtSecret`).
 * @param info  - Domain identifier (e.g. `"jwt-sign"`, `"assets-signed-url"`,
 *                `"nsfw-pii"`). MUST be unique per consumer.
 * @param length - Output length in bytes. Defaults to 32 (256 bits).
 * @returns `length` bytes of subkey material as a `Uint8Array`.
 */
export async function domainKey(
  secret: string,
  info: string,
  length: number = 32,
): Promise<Uint8Array> {
  if (!secret) {
    throw new Error("domainKey: secret must be non-empty",);
  }
  if (!info) {
    throw new Error("domainKey: info must be non-empty (use a domain-scoped id)",);
  }
  if (length <= 0 || length > 255 * 32) {
    throw new Error(`domainKey: length out of range (got ${length})`,);
  }
  const ikm = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret,),
    "HKDF",
    false,
    ["deriveBits",],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32,), // empty (zeros) salt — domain separation is in `info`
      info: new TextEncoder().encode(VERSIONED_PREFIX + info,),
    },
    ikm,
    length * 8,
  );
  return new Uint8Array(bits,);
}

/** Stable string identifiers for every domain that consumes a shared secret. */
export const DOMAIN_INFO = {
  /** JWT signing MAC (`src/auth/jwt.ts`). */
  JWT_SIGNING: "jwt-sign",
  /** Asset signed-URL HMAC (`src/assets/controller/signed-url.ts`). */
  ASSETS_SIGNED_URL: "assets-signed-url",
  /** NSFW PII pseudonymization salt (`src/nsfw/pii-redaction.ts`). */
  NSFW_PII: "nsfw-pii",
  /** Admin telemetry PII hashing (`src/routes/admin/aux-telemetry.ts`).
 Stable, HMAC-derived hash for user_id and chat_id surfaced on the
 admin telemetry endpoints. Same domain separation as NSFW_PII so a
 leak in one does not compromise cross-domain identifiers. */
  TELEMETRY_PII: "telemetry-pii",
} as const;

/**
 * HMAC-SHA256 of a value using a domain-separated subkey. Suitable for
 * stable identifier pseudonymization across admin views. Same input →
 * same output (no salt/rotate), different `info` → different output.
 *
 * SECURITY (BUG-admin-auxtelemetry-leaks-userid-chatid): the wire
 * surface MUST NOT carry raw user_id / chat_id. Use this helper to
 * project raw columns to a 16-hex-char prefix suitable for cross-row
 * correlation without exposing the underlying identifier.
 *
 * @param secret - High-entropy shared secret (e.g. `auth.jwtSecret`).
 * @param info   - One of `DOMAIN_INFO.*`. MUST be unique per consumer.
 * @param value  - Raw identifier to hash.
 * @returns 16-hex-char prefix (8 bytes) of the HMAC. Stable for the
 *   same `(secret, info, value)` triple.
 */
export async function hashWithDomain(
  secret: string,
  info: string,
  value: string,
): Promise<string> {
  const ikm = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret,),
    "HKDF",
    false,
    ["deriveBits",],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32,),
      info: new TextEncoder().encode(VERSIONED_PREFIX + info,),
    },
    ikm,
    8 * 8,
  );
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    bits,
    { name: "HMAC", hash: "SHA-256", },
    false,
    ["sign",],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new TextEncoder().encode(value,),
  );
  return [...new Uint8Array(sig,),]
    .slice(0, 8,)
    .map((b,) => b.toString(16,).padStart(2, "0",))
    .join("",);
}
