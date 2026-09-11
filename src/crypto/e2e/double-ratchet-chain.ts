// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 42

import { CHAIN_KEY_INFO, KEY_LENGTH, } from "./double-ratchet";

/**
 * Derive the 32-byte chain key from the ECDH shared secret + chain index.
 * Salt = chainIndex as 8-byte big-endian; info = CHAIN_KEY_INFO. Binds the
 * chain key to the specific message position so two messages on different
 * indices derive different keys even with the same shared secret.
 * @param sharedBytes
 * @param chainIndex
 * @returns void
 */
export async function deriveChainKey(
  sharedBytes: Uint8Array,
  chainIndex: number,
): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(sharedBytes,).buffer as ArrayBuffer,
    "HKDF",
    false,
    ["deriveBits",],
  );
  const salt = new Uint8Array(8,);
  new DataView(salt.buffer,).setBigUint64(0, BigInt(chainIndex,),);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(salt,).buffer as ArrayBuffer,
      info: new TextEncoder().encode(CHAIN_KEY_INFO,),
    },
    base,
    KEY_LENGTH * 8,
  );
  return new Uint8Array(bits,);
}
