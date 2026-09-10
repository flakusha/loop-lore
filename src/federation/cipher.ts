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

/** Byte-oriented content cipher for one mesh trust domain. */
export interface ContentCipher {
  /** Encrypt plaintext bytes into an opaque ciphertext string. */
  seal(plaintext: Uint8Array,): Promise<string>;
  /** Decrypt back to the original bytes. @throws On decrypt failure. */
  open(ciphertext: string,): Promise<Uint8Array>;
}

/**
 * Shared-secret cipher over the BYOK AES-256-GCM module.
 * @param secret Mesh PSK (operator-distributed, env-only: MESH_PSK).
 */
export function pskCipher(secret: string,): ContentCipher {
  return {
    async seal(plaintext: Uint8Array,): Promise<string> {
      return encryptValue(Buffer.from(plaintext,).toString("base64",), secret,);
    },
    async open(ciphertext: string,): Promise<Uint8Array> {
      return Buffer.from(await decryptValue(ciphertext, secret,), "base64",);
    },
  };
}
