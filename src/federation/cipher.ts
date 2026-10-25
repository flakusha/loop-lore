// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/cipher.ts — Content cipher seam for mesh envelopes.
//
// Envelope crypto programs against `ContentCipher`, with `pskCipher` (AES-GCM
// via the BYOK module, operator-shared mesh PSK) as the byte cipher.
// Cipher selection lives in `./encryption` (`MeshEncryptionProvider`):
// issued per-target keys first, PSK fallback; inbound sender keys then PSK
// on the receiver. Future epic-level `EncryptionProvider` backends
// (Matrix/OMEMO/PGP) implement that interface without touching call sites.

import { decryptValue, encryptValue, } from "../crypto/byok";
import { safeFromBase64, safeFromUint8Array, safeToBase64, } from "../utils/safe-buffer";

/** Byte-oriented content cipher for one mesh trust domain. */
export interface ContentCipher {
  /**
   * Encrypt plaintext bytes into an opaque ciphertext string.
   * @param aad Optional additional authenticated data: when given, the
   *   ciphertext can only be opened with the identical AAD (context
   *   binding — see the DEK re-wrap protocol).
   */
  seal(plaintext: Uint8Array, aad?: string,): Promise<string>;
  /**
   * Decrypt back to the original bytes.
   * @param aad The AAD the ciphertext was sealed under.
   * @throws On decrypt failure (wrong key, tampering, or AAD mismatch).
   */
  open(ciphertext: string, aad?: string,): Promise<Uint8Array>;
}

/**
 * Shared-secret cipher over the BYOK AES-256-GCM module.
 * @param secret Mesh PSK (operator-distributed, env-only: MESH_PSK).
 * @throws {Error}
 * @throws {Error}
 * @throws {Error}
 * @returns {ContentCipher}
 */
export function pskCipher(secret: string,): ContentCipher {
  return {
    /**
     * @param {Uint8Array} plaintext
     * @throws {Error}
     * @throws {Error}
     * @returns {Promise<string>}
     */
    async seal(plaintext: Uint8Array, aad?: string,): Promise<string> {
      const bytes = safeFromUint8Array(plaintext,);
      if (!bytes.ok) { throw bytes.error; }
      const b64 = safeToBase64(bytes.buffer,);
      if (!b64.ok) { throw b64.error; }
      return encryptValue(b64.buffer, secret, aad,);
    },
    /**
     * @param {string} ciphertext
     * @throws {Error}
     * @returns {Promise<Uint8Array<ArrayBufferLike>>}
     */
    async open(ciphertext: string, aad?: string,): Promise<Uint8Array> {
      const raw = await decryptValue(ciphertext, secret, aad,);
      const bytes = safeFromBase64(raw,);
      if (!bytes.ok) { throw bytes.error; }
      return new Uint8Array(bytes.buffer,);
    },
  };
}
