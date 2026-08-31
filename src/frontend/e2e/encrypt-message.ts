// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Client-side E2E message encryption (TASK-asymmetric-key-pairs-followup — Phase A)
 *
 * Sends one encrypted message to one recipient. The wire payload is a
 * self-describing JSON blob containing every value the receiver needs to
 * decrypt without any out-of-band signal from the server:
 *
 *   - `ciphertext` : base64 AES-256-GCM ciphertext
 *   - `nonce`      : base64 12-byte IV (unique per message)
 *   - `senderEphPub`: base64 JWK of an ephemeral ECDH public key (sender-only)
 *   - `chainKey`   : base64 32-byte chain key the sender used for this message
 *
 * The receiver re-derives the raw ECDH shared bytes from `senderEphPub` +
 * their own private key, XORs with the chain key, runs the ratchet step to
 * obtain the same message key the sender used, then AES-GCM-decrypts
 * `ciphertext` with `nonce`.
 *
 * Out of scope (Phase B/C): chain-key persistence, group chat distribution,
 * forward-secrecy re-keying. Phase A is one-shot per message.
 */

import {
  deriveSharedBytes,
  exportPublicJwk,
  generateKeyPair,
  importPublicKey,
} from "../../crypto/e2e/key-pairs";
import { nextRatchetStep, } from "../../crypto/e2e/ratchet";
import { loadOrCreateKeyPair, } from "./key-store";
import { fetchRecipientPublicKey, } from "./recipient-pubkey";

const IV_LENGTH = 12;

/** */
export interface EncryptMessageOpts {
  senderActorId: string;
  recipientActorId: string;
  chainKey: Uint8Array;
  plaintext: string;
}

/** */
export interface EncryptedPayload {
  ciphertext: string;
  nonce: string;
  senderEphPub: JsonWebKey;
  chainKey: string;
}

/**
 * Encrypt a plaintext message for a single recipient using the local
 * actor's private key + the recipient's public key + a chain key.
 *
 * Generates a one-shot ephemeral key pair for this message (the "ephemeral
 * ECDH" pattern), XORs the raw shared bytes with the chain key, runs one
 * ratchet step to derive the message key, and encrypts with AES-GCM.
 *
 * Throws if the recipient has no registered public key (`fetchRecipientPublicKey`
 * returns null) or if any WebCrypto operation fails.
 * @param opts
 */
export async function encryptMessage(opts: EncryptMessageOpts,): Promise<EncryptedPayload> {
  const recipientPub = await fetchRecipientPublicKey(opts.recipientActorId,);
  if (!recipientPub) {
    throw new Error(`recipient ${opts.recipientActorId} has no active E2E public key`,);
  }

  const recipientCryptoKey = await importPublicKey(recipientPub,);
  const ephemeral = await generateKeyPair({ extractable: true, },);
  const ephemeralPubJwk = await exportPublicJwk(ephemeral.publicKey,);

  const sharedBytes = await deriveSharedBytes({
    privateKey: ephemeral.privateKey,
    publicKey: recipientCryptoKey,
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
    ["encrypt",],
  );

  const nonce = crypto.getRandomValues(new Uint8Array(IV_LENGTH,),);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce as Uint8Array<ArrayBuffer>, },
    cryptoKey,
    new TextEncoder().encode(opts.plaintext,) as Uint8Array<ArrayBuffer>,
  );

  return {
    ciphertext: toBase64(new Uint8Array(ct,),),
    nonce: toBase64(nonce,),
    senderEphPub: ephemeralPubJwk,
    chainKey: toBase64(nextChainKey,),
  };
}

/**
 * Bootstrap a fresh chain key from the local actor's persisted key pair +
 * the recipient's persisted public key. The caller stores the returned
 * `chainKey` for use on the next call to `encryptMessage`.
 * @param senderActorId
 * @param recipientActorId
 */
export async function bootstrapChainKey(senderActorId: string, recipientActorId: string,): Promise<Uint8Array> {
  const { cryptoKeyPair, } = await loadOrCreateKeyPair({ actorId: senderActorId, },);
  const recipientPub = await fetchRecipientPublicKey(recipientActorId,);
  if (!recipientPub) {
    throw new Error(`recipient ${recipientActorId} has no active E2E public key`,);
  }
  const recipientCryptoKey = await importPublicKey(recipientPub,);
  return deriveSharedBytes({
    privateKey: cryptoKeyPair.privateKey,
    publicKey: recipientCryptoKey,
  },);
}

// ── Helpers ──────────────────────────────────────────────

/**
 * @param bytes
 */
function toBase64(bytes: Uint8Array,): string {
  return bytes.toBase64();
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
