// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Base64 encode/decode for binary blobs that need to survive a JSON
 * round-trip. `Uint8Array` serializes via JSON as `{ "0": byte, ... }` —
 * a plain object, not a typed array — so `JSON.parse` on the other side
 * can't directly use it as a WebCrypto `BufferSource`. Base64 sidesteps
 * that by carrying binary data as a string.
 *
 * No URL-safe alphabet (we don't need it inside the app); no `Buffer`
 * dependency (so this works the same in browser + Node + Bun).
 */

/**
 * Encode a `Uint8Array` as base64 (no URL-safe alphabet).
 * @param bytes - input bytes
 * @returns base64-encoded string (standard alphabet, no URL-safe).
 */
export function toBase64(bytes: Uint8Array,): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]!,); }
  return btoa(binary,);
}

/**
 * Decode a base64 string into a fresh `Uint8Array`.
 * @param b64 - base64-encoded string
 * @returns decoded bytes as Uint8Array.
 */
export function fromBase64(b64: string,): Uint8Array {
  const binary = atob(b64,);
  const out = new Uint8Array(binary.length,);
  for (let i = 0; i < binary.length; i++) { out[i] = binary.charCodeAt(i,); }
  return out;
}
