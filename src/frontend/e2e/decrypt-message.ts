// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Client-side E2E message decryption (TASK-asymmetric-key-pairs-followup — Phase A)
 *
 * Inverse of `encryptMessage.ts`. Given an `EncryptedPayload` + the local
 * actor's ID (so we know whose private key to use) + the chain key the
 * recipient is holding, derives the same message key and decrypts the
 * ciphertext.
 *
 * Out of scope (Phase B/C): chain-key persistence across messages, group
 * chat multi-recipient, replay protection. Phase A decrypts exactly one
 * message at a time.
 */

import { deriveSharedBytes, importPublicKey, } from "../../crypto/e2e/key-pairs";
import { nextRatchetStep, } from "../../crypto/e2e/ratchet";
import { type EncryptedPayload, } from "./encrypt-message";
import { loadOrCreateKeyPair, } from "./key-store";

/** */
export interface DecryptMessageOpts {
  /** The local actor (the recipient of the message). */
  recipientActorId: string;
  /** Current chain key the recipient is holding (advanced after each call). */
  chainKey: Uint8Array;
  /** The encrypted payload to decrypt. */
  payload: EncryptedPayload;
}

/** */
export interface DecryptedMessage {
  plaintext: string;
  /** Updated chain key after consuming this message. */
  nextChainKey: Uint8Array;
}

/**
 * Decrypt one encrypted message using the recipient's private key + the
 * sender's ephemeral public key from the payload.
 *
 * Throws on:
 *   - AES-GCM auth-tag mismatch (tampered / wrong key)
 *   - Recipient has no persisted private key
 *   - WebCrypto failures
 * @param opts
 */
export async function decryptMessage(opts: DecryptMessageOpts,): Promise<DecryptedMessage> {
  const { cryptoKeyPair, } = await loadOrCreateKeyPair({ actorId: opts.recipientActorId, },);

  const ephemeralPub = await importPublicKey(opts.payload.senderEphPub,);

  const sharedBytes = await deriveSharedBytes({
    privateKey: cryptoKeyPair.privateKey,
    publicKey: ephemeralPub,
  },);

  const mixedIkm = xorBytes(sharedBytes, opts.chainKey,);
  sharedBytes.fill(0,);

  const { chainKey: nextChainKey, messageKey, } = await nextRatchetStep(mixedIkm,);
  mixedIkm.fill(0,);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    messageKey as Uint8Array<ArrayBuffer>,
    { name: "AES-GCM", length: 256, },
    false,
    ["decrypt",],
  );

  const ct = fromBase64(opts.payload.ciphertext,);
  const nonce = fromBase64(opts.payload.nonce,);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce as Uint8Array<ArrayBuffer>, },
    cryptoKey,
    ct as Uint8Array<ArrayBuffer>,
  );

  return {
    plaintext: new TextDecoder().decode(pt,),
    nextChainKey,
  };
}

// ── Helpers ──────────────────────────────────────────────

/**
 * @param b64
 */
function fromBase64(b64: string,): Uint8Array {
  return Uint8Array.fromBase64(b64,);
}

/**
 * @param a
 * @param b
 */
function xorBytes(a: Uint8Array, b: Uint8Array,): Uint8Array {
  const len = Math.min(a.byteLength, b.byteLength,);
  const out = new Uint8Array(len,);
  for (let i = 0; i < len; i++) {
    out[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return out;
}
