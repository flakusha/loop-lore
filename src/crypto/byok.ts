// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * BYO Key Crypto — Server-side AES-256-GCM encrypt/decrypt
 *
 * Used for BYO API key encryption at rest.
 *
 * SECURITY (BUG-jwtsecret-reused-across-three-security-domains):
 *   - Each encryption uses a fresh random 16-byte salt (prepended to the
 *     wire format), defeating precomputation across users with the same
 *     passphrase. Old format (`iv:ciphertext`) used a fixed global salt,
 *     which let an attacker precompute a rainbow table once and crack every
 *     user's key in O(1) lookups.
 *   - Key derivation switched from raw PBKDF2 to HKDF-SHA256 with the
 *     per-record salt as input — independent keys even if the salt was
 *     ever reused (defense in depth).
 *
 * Wire format (new): `salt:iv:ciphertext` (three base64 chunks).
 * Wire format (old, still readable): `iv:ciphertext` (two base64 chunks).
 * `decryptValue` accepts both formats; new `encryptValue` always emits the
 * 3-chunk form. Rows persisted under the old format are not silently
 * re-encrypted — callers should plan a one-shot migration to re-encrypt.
 */
const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96-bit nonce for GCM
const SALT_LENGTH = 16; // 128-bit per-record salt

/**
 * Derive an AES-256-GCM CryptoKey from a string secret + per-record salt.
 * Uses HKDF-SHA256 (no PBKDF2) with the salt as the HKDF `salt` input.
 * @param secret
 * @param salt
 */
async function deriveKey(secret: string, salt: Uint8Array,): Promise<CryptoKey> {
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
      // The TS lib types of WebCrypto accept `BufferSource` but the
      // runtime accepts the ArrayBuffer-backed buffer.
      salt: salt as unknown as BufferSource,
      info: new TextEncoder().encode("loop-lore/byok/v1",),
    },
    ikm,
    KEY_LENGTH,
  );
  // Copy bits into a fresh Uint8Array<ArrayBuffer> so it satisfies the
  // BufferSource signature; matches the toBufferSource pattern used in
  // src/auth/jwt.ts and src/assets/controller/signed-url.ts.
  const keyBytes = new Uint8Array(bits.byteLength,);
  keyBytes.set(new Uint8Array(bits,),);
  return crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as Uint8Array<ArrayBuffer>,
    { name: ALGORITHM, },
    false,
    ["encrypt", "decrypt",],
  );
}

/** Fixed global salt used by the OLD wire format ("iv:ciphertext"). */
const LEGACY_GLOBAL_SALT = new TextEncoder().encode("loop-lore-byok-v1",);

/**
 * Encrypt a plaintext string.
 * Returns base64-encoded "salt:iv:ciphertext" (three chunks).
 * @param plaintext
 * @param secret
 */
export async function encryptValue(plaintext: string, secret: string,): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH,),);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH,),);
  const key = await deriveKey(secret, salt,);
  const encoded = new TextEncoder().encode(plaintext,);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv, }, key, encoded,);
  return `${salt.toBase64()}:${iv.toBase64()}:${new Uint8Array(ciphertext,).toBase64()}`;
}

/**
 * Decrypt a base64-encoded string. Accepts both wire formats:
 *   - new (3 chunks): "salt:iv:ciphertext"
 *   - old (2 chunks): "iv:ciphertext" — uses the legacy global salt
 * @param encrypted
 * @param secret
 */
export async function decryptValue(encrypted: string, secret: string,): Promise<string> {
  const parts = encrypted.split(":",);
  if (parts.length === 3) {
    const salt = Uint8Array.fromBase64(parts[0]!,);
    const iv = Uint8Array.fromBase64(parts[1]!,);
    const data = Uint8Array.fromBase64(parts[2]!,);
    const key = await deriveKey(secret, salt,);
    const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv, }, key, data,);
    return new TextDecoder().decode(plaintext,);
  }
  if (parts.length === 2) {
    const iv = Uint8Array.fromBase64(parts[0]!,);
    const data = Uint8Array.fromBase64(parts[1]!,);
    const key = await deriveKey(secret, LEGACY_GLOBAL_SALT,);
    const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv, }, key, data,);
    return new TextDecoder().decode(plaintext,);
  }
  throw new Error("Invalid encrypted value format",);
}
