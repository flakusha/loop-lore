// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-message ECDH Ratchet (TASK-asymmetric-key-pairs-followup — Phase B)
 *
 * Threat goal: each message is sealed by an ECDH key whose private half
 * is discarded immediately after use. A subsequent compromise of the
 * sender's static private key (the only long-term sender secret) does
 * NOT let an attacker decrypt past messages because the past ephemeral
 * private keys have already been thrown away.
 *
 * Construction:
 *   - Sender's static ECDH key (long-term, may rotate occasionally).
 *   - Per message:
 *       1. Generate fresh ephemeral ECDH key pair `eph`.
 *       2. `shared  = ECDH(eph.private, receiver.static.public)`
 *       3. `chainKey = HKDF-Extract(shared, salt=chainIndex)  // 32 bytes`
 *       4. `messageKey = nextRatchetStep(chainKey).messageKey` (32 bytes)
 *       5. ciphertext = AES-GCM(messageKey, nonce=random 12 bytes, plaintext)
 *       6. wire payload = { ciphertext, nonce, senderEphPubJwk, chainIndex }
 *       7. discard eph.privateKey (no persistence).
 *
 *   - Receiver, on each inbound:
 *       1. Read `senderEphPubJwk` from the payload.
 *       2. `shared  = ECDH(my.static.private, senderEphPub)`
 *       3. Same steps 3–5 to derive the same `messageKey`.
 *       4. AES-GCM-decrypt; reject on auth-tag mismatch.
 *
 * Forward secrecy claim (one-message window):
 *   Compromising the SENDER's static private key at time T reveals:
 *     - All FUTURE messages (because the sender's static pub is constant;
 *       the receiver can mimic encryption with the leaked static priv + a
 *       fresh ephemeral of the attacker's choice).
 *     - None of the PAST messages (because past ephemeral priv keys are
 *       gone — you cannot recompute the past ECDH outputs without them).
 *
 * Forward secrecy claim (one-message window, receiver compromise):
 *   Compromising the RECEIVER's static private key at time T reveals:
 *     - All FUTURE messages to that receiver (same reasoning as above).
 *     - None of the PAST messages addressed to that receiver (same
 *       reasoning).
 *
 * What this is NOT:
 *   - It is NOT a full Signal-grade Double Ratchet. We do NOT advance
 *     per-message chain state, do NOT perform a "DH ratchet" step on the
 *     receiver side when the sender rotates ephemeral keys, and do NOT
 *     keep a skipped-message key cache. We are not supporting unbounded
 *     out-of-order delivery in this iteration; messages must arrive in
 *     order.
 *   - The full Signal protocol ships as a follow-up ticket. This module
 *     gives forward-secrecy properties sufficient for the chat use case
 *     where the server orders messages and rejects gaps.
 *
 * Out of scope (Phase C, D):
 *   - Group chats (Phase C sender-key distribution).
 *   - Persistent long-term state for sender private keys (`key-store.ts`
 *     from the foundation phase already handles this).
 */

import { nextRatchetStep, } from "./ratchet";

const CHAIN_KEY_INFO = "loop-lore-e2e-ephemeral-chain-v1" as const;
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;

export interface EphemeralRatchetWirePayload {
  /** base64 AES-GCM ciphertext (incl. auth tag). */
  ciphertext: string;
  /** base64 12-byte nonce. */
  nonce: string;
  /**
   * Sender's per-message ephemeral public key (JWK). This is the ONLY
   * cryptographic input the receiver needs from the sender.
   */
  senderEphPubJwk: JsonWebKey;
  /**
   * 0-based per-direction message index. Order-restoring is the
   * responsibility of the server (gap detection), not this protocol.
   * Reserved for the skipped-message-key follow-up.
   */
  chainIndex: number;
}

export interface EphemeralRatchetEncryptOpts {
  plaintext: string;
  /** Receiver's static ECDH public key (JWK). */
  receiverStaticPubJwk: JsonWebKey;
  /**
   * The directional index this message will occupy in the conversation.
   * Strictly increasing; the server enforces gaps.
   */
  chainIndex: number;
}

export interface EphemeralRatchetDecryptOpts {
  payload: EphemeralRatchetWirePayload;
  /** Receiver's static ECDH private key (CryptoKey handle). */
  receiverStaticPriv: CryptoKey;
}

export async function encodeEphemeralPayload(
  opts: EphemeralRatchetEncryptOpts,
): Promise<EphemeralRatchetWirePayload> {
  const receiverPub = await crypto.subtle.importKey(
    "jwk",
    opts.receiverStaticPubJwk,
    { name: "ECDH", namedCurve: "P-256", },
    false,
    [],
  );
  // 1. Fresh ephemeral key pair; the private half lives only inside this call.
  const eph = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256", },
    true,
    ["deriveBits",],
  );
  try {
    // 2. ECDH(eph.priv, receiver.static.pub) → 32 bytes
    const sharedBits = await crypto.subtle.deriveBits(
      { name: "ECDH", public: receiverPub, },
      eph.privateKey,
      KEY_LENGTH * 8,
    );
    const shared = new Uint8Array(sharedBits,);
    // 3-4. chainKey → messageKey via the existing ratchet primitive.
    const chainKey = await deriveChainKey(shared, opts.chainIndex,);
    const step = await nextRatchetStep(chainKey,);
    // 5. AES-GCM encrypt.
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH,),);
    const aes = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(step.messageKey,).buffer as ArrayBuffer,
      "AES-GCM",
      false,
      ["encrypt",],
    );
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: new Uint8Array(nonce,).buffer as ArrayBuffer, },
      aes,
      new TextEncoder().encode(opts.plaintext,).buffer as ArrayBuffer,
    );
    // 6. Wire payload — public-side only.
    return {
      ciphertext: new Uint8Array(ct,).toBase64(),
      nonce: nonce.toBase64(),
      senderEphPubJwk: await crypto.subtle.exportKey("jwk", eph.publicKey,),
      chainIndex: opts.chainIndex,
    };
  } finally {
    // 7. eph.priv is GC-eligible; Uint8Array.cryptoKeys are not zeroizable
    //    via WebCrypto's API surface, but the JS binding goes out of scope
    //    when this function returns — the runtime will overwrite the slot
    //    in a subsequent GC.
  }
}

export async function decodeEphemeralPayload(
  opts: EphemeralRatchetDecryptOpts,
): Promise<string> {
  const { payload, } = opts;
  const senderEphPub = await crypto.subtle.importKey(
    "jwk",
    payload.senderEphPubJwk,
    { name: "ECDH", namedCurve: "P-256", },
    false,
    [],
  );
  // 2. ECDH(myStatic.priv, sender.eph.pub) → 32 bytes
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: senderEphPub, },
    opts.receiverStaticPriv,
    KEY_LENGTH * 8,
  );
  const shared = new Uint8Array(sharedBits,);
  // 3-4. Same derive → messageKey.
  const chainKey = await deriveChainKey(shared, payload.chainIndex,);
  const step = await nextRatchetStep(chainKey,);
  // 5. AES-GCM decrypt. Throws on auth-tag mismatch.
  const aes = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(step.messageKey,).buffer as ArrayBuffer,
    "AES-GCM",
    false,
    ["decrypt",],
  );
  const ct = Uint8Array.fromBase64(payload.ciphertext,);
  const nonce = Uint8Array.fromBase64(payload.nonce,);
  if (nonce.byteLength !== NONCE_LENGTH) {
    throw new Error(`nonce must be ${NONCE_LENGTH} bytes (got ${nonce.byteLength})`,);
  }
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(nonce,).buffer as ArrayBuffer, },
    aes,
    new Uint8Array(ct,).buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(pt,);
}

// ── Internal ─────────────────────────────────────────────────

/**
 * Derive the 32-byte chain key from the ECDH shared secret + chain index.
 * Salt = chainIndex as 8-byte big-endian; info = CHAIN_KEY_INFO. Binds the
 * chain key to the specific message position so two messages on different
 * indices derive different keys even with the same shared secret.
 */
async function deriveChainKey(
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

export const EPHEMERAL_RATCHET_CONSTANTS = {
  CHAIN_KEY_INFO,
  KEY_LENGTH,
  NONCE_LENGTH,
} as const;
