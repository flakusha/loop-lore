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
 * 3-chunk form.
 *
 * KEY VERSIONING (BUG-single-global-byok-encryption-key-no-rotation-story):
 * a versioned envelope `v2:salt:iv:ciphertext` exists so a future key
 * rotation can carry its key-generation tag per record instead of relying on
 * one global secret. `encryptVersioned` emits it; `decryptValue` reads it AND
 * both bare legacy formats, so rows sealed under any generation decrypt
 * without a one-shot rewrite. The `key_version` columns added by migration
 * 080 (`user_api_keys`, `mesh_peers`) default to 1 = bare (unversioned)
 * format, matching every row written before the column existed.
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
 * @returns string
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
 * @param aad Optional additional authenticated data (AES-GCM AAD): integrity-
 *   bound to the ciphertext but not stored in it. Omit for the legacy
 *   behavior (no AAD); omitting on decrypt matches ciphertexts sealed
 *   without AAD.
 * @returns void
 */
export async function encryptValue(plaintext: string, secret: string, aad?: string,): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH,),);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH,),);
  const key = await deriveKey(secret, salt,);
  const encoded = new TextEncoder().encode(plaintext,);
  const params: AesGcmParams = { name: ALGORITHM, iv, };
  if (aad !== undefined) {
    params.additionalData = new TextEncoder().encode(aad,) as unknown as BufferSource;
  }

  const ciphertext = await crypto.subtle.encrypt(params, key, encoded,);
  return `${salt.toBase64()}:${iv.toBase64()}:${new Uint8Array(ciphertext,).toBase64()}`;
}

/** Current versioned-envelope generation (BUG-4a052a5 rotation story). */
export const BYOK_KEY_VERSION = 2;

/**
 * Version tag at the head of a versioned envelope: `v<digits>:`.
 *
 * MUST NOT be relaxed to a bare leading "v": the bare wire formats begin
 * with a random base64 salt/iv whose first character is "v" roughly 1 time
 * in 64, and those rows are unversioned.
 */
const VERSION_TAG = /^v(\d+):/;

/**
 * Encrypt a plaintext string into the VERSIONED envelope:
 * `v2:salt:iv:ciphertext` (version tag + three base64 chunks). The payload
 * bytes are identical to {@link encryptValue} — the tag only records which
 * key generation sealed the row, so a future rotation can branch per record
 * instead of mass re-encrypting under one global secret.
 * @param plaintext
 * @param secret
 * @param aad Optional additional authenticated data (see encryptValue)
 * @returns string
 */
export async function encryptVersioned(plaintext: string, secret: string, aad?: string,): Promise<string> {
  return `v${BYOK_KEY_VERSION}:${await encryptValue(plaintext, secret, aad,)}`;
}

/**
 * Decrypt a base64-encoded string. Accepts all three wire formats:
 *   - versioned (4 chunks): "v2:salt:iv:ciphertext" — current envelope
 *   - new (3 chunks): "salt:iv:ciphertext"
 *   - old (2 chunks): "iv:ciphertext" — uses the legacy global salt
 * @param encrypted
 * @param secret
 * @param aad Optional additional authenticated data — must match the value
 *   used at seal time or authentication fails.
 * @returns void
 * @throws {Error}
 */
export async function decryptValue(encrypted: string, secret: string, aad?: string,): Promise<string> {
  // Versioned envelope: strip the `v<N>:` tag, then decrypt the bare
  // 3-chunk payload. Unknown generations fail LOUDLY (they need the key of
  // that generation, which this caller does not hold) — never silently
  // mis-decrypted with the current one.
  //
  // The tag is matched as `v<digits>:` and NOT as a leading "v": the bare
  // formats start with a random base64 salt/iv, and base64 can begin with
  // "v" (~1 in 64 rows). A prefix test read those rows as a version tag and
  // rejected perfectly good ciphertext as "Unsupported BYOK key version".
  const versioned = VERSION_TAG.exec(encrypted,);
  if (versioned !== null) {
    const version = Number(versioned[1],);
    if (version !== BYOK_KEY_VERSION) {
      throw new Error(`Unsupported BYOK key version: ${versioned[1]}`,);
    }

    encrypted = encrypted.slice(versioned[0].length,);
  }

  const parts = encrypted.split(":",);
  if (parts.length === 3) {
    const salt = Uint8Array.fromBase64(parts[0]!,);
    const iv = Uint8Array.fromBase64(parts[1]!,);
    const data = Uint8Array.fromBase64(parts[2]!,);
    const key = await deriveKey(secret, salt,);
    const params: AesGcmParams = { name: ALGORITHM, iv, };
    if (aad !== undefined) {
      params.additionalData = new TextEncoder().encode(aad,) as unknown as BufferSource;
    }

    const plaintext = await crypto.subtle.decrypt(params, key, data,);
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
