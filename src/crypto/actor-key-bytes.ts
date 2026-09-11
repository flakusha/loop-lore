// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor key byte envelope (AES-GCM).
 *
 * Raw byte encrypt/decrypt for key material at rest, split from
 * `actor-keys.ts` to keep it under the file-size guard. Byte-identical.
 */

const IV_LENGTH = 12; // 96-bit nonce for GCM

/**
 * @param key
 * @param plaintext
 * @returns void
 */
export async function encryptBytes(key: CryptoKey, plaintext: Uint8Array,): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH,),);
  const input = toBufferSource(plaintext,);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, }, key, input,);
  const ivB64 = new Uint8Array(iv,).toBase64();
  const ctB64 = new Uint8Array(ciphertext,).toBase64();
  return `${ivB64}:${ctB64}`;
}

/**
 * @param key
 * @param encrypted
 * @returns void
 */
export async function decryptBytes(key: CryptoKey, encrypted: string,): Promise<Uint8Array> {
  if (!encrypted) { throw new Error("decryptBytes: encrypted value is empty",); }
  // sonarjs false positive: !encrypted guard on line above

  const parts = encrypted.split(":",);
  if (parts.length !== 2) { throw new Error("Invalid encrypted key format",); }
  const iv = toBufferSource(Uint8Array.fromBase64(parts[0]!,),);
  const data = toBufferSource(Uint8Array.fromBase64(parts[1]!,),);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv, }, key, data,);
  return new Uint8Array(plaintext,);
}
/**
 * Workaround for Bun's Uint8Array generics vs Web Crypto BufferSource.
 * @param arr - typed array view of a key/IV
 * @returns the same array retyped to `Uint8Array<ArrayBuffer>` for WebCrypto APIs.
 */
function toBufferSource(arr: Uint8Array,): Uint8Array<ArrayBuffer> {
  return arr as unknown as Uint8Array<ArrayBuffer>;
}
