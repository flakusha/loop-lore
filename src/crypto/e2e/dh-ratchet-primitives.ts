// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Low-level cryptographic primitives for the DH ratchet
 * (TASK-asymmetric-key-pairs-followup §Phase B).
 *
 * Exposes the building blocks — dhStep, chainStep, deriveChainKeyFromRoot,
 * decryptWithMessageKey, canonicalJwk — so the state-machine code in
 * `dh-ratchet.ts` can stay focused on the protocol flow.
 */
import { fromBase64, toBase64, } from "../../utils/base64";
import { safeJsonStringify, } from "../../utils/safe-json";
export interface DhMessagePayload {
  ephemeralPublicJwk: JsonWebKey;
  counter: number;
  nonce: string;
  ciphertext: string;
}

export const KEY_BYTES = 32;

export const ROOT_KEY_INFO = "loop-lore-e2e-dh-root-step-v1";
export const CHAIN_KEY_INFO = "loop-lore-e2e-dh-chain-step-v1";
export const MESSAGE_KEY_INFO = "loop-lore-e2e-dh-message-key-step-v1";
export const INITIAL_CHAIN_INFO = "loop-lore-e2e-dh-initial-chain-v1";
export const MESSAGE_KEY_BITS = 256;

/**
 * DH step: ECDH(myPriv, theirPub) → shared → HKDF(rootKey, shared) →
 * (newRoot, sendingChainKey).
 *
 * Implementation note: we do TWO HKDF expansions (one for newRoot, one
 * for newChainKey) by re-importing the hkdfKey each time. Bun's
 * WebCrypto appears to behave better when hkdfKey is freshly imported
 * per derivation rather than reused across multiple deriveBits calls.
 */
export async function dhStep(
  rootKey: Uint8Array,
  myPriv: CryptoKey,
  theirPub: CryptoKey,
): Promise<{ newRoot: Uint8Array; sendingChainKey: Uint8Array }> {
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: theirPub, }, myPriv, 256,);
  const salt = new Uint8Array(rootKey,);

  const hkdfKey1 = await crypto.subtle.importKey("raw", new Uint8Array(sharedBits,), "HKDF", false, ["deriveBits",],);
  const newRootBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(ROOT_KEY_INFO,), },
    hkdfKey1,
    KEY_BYTES * 8,
  );

  const hkdfKey2 = await crypto.subtle.importKey("raw", new Uint8Array(sharedBits,), "HKDF", false, ["deriveBits",],);
  const sendingChainBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(salt,), info: new TextEncoder().encode(CHAIN_KEY_INFO,), },
    hkdfKey2,
    KEY_BYTES * 8,
  );

  return {
    newRoot: new Uint8Array(newRootBits,) as Uint8Array<ArrayBuffer>,
    sendingChainKey: new Uint8Array(sendingChainBits,) as Uint8Array<ArrayBuffer>,
  };
}

/**
 * Derive the initial chain key from the shared root key (deterministic,
 * both sides compute the same value). Used by initDhRatchet to seed
 * both sendingChainKey and receivingChainKey without an ECDH round-trip.
 */
export async function deriveChainKeyFromRoot(rootKey: Uint8Array,): Promise<ArrayBuffer> {
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(rootKey,),
    "HKDF",
    false,
    ["deriveBits",],
  );
  return crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(KEY_BYTES,),
      info: new TextEncoder().encode(INITIAL_CHAIN_INFO,),
    },
    hkdfKey,
    KEY_BYTES * 8,
  );
}

/** Advance the chain key by one step. */
export async function chainStep(chainKey: Uint8Array,): Promise<{
  nextChainKey: Uint8Array;
  messageKey: CryptoKey;
  messageKeyBytes: Uint8Array;
}> {
  if (chainKey.byteLength !== KEY_BYTES) {
    throw new Error(`chainKey must be ${KEY_BYTES} bytes (got ${chainKey.byteLength})`,);
  }

  // Fresh hkdfKey per call (Bun WebCrypto quirk: reusing hkdfKey across
  // multiple deriveBits on the same call can fail with "key is not extractable").
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(chainKey,),
    "HKDF",
    false,
    ["deriveBits",],
  );

  const nextChainBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(KEY_BYTES,),
      info: new TextEncoder().encode(CHAIN_KEY_INFO,),
    },
    hkdfKey,
    KEY_BYTES * 8,
  );
  const messageKeyBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(KEY_BYTES,),
      info: new TextEncoder().encode(MESSAGE_KEY_INFO,),
    },
    hkdfKey,
    MESSAGE_KEY_BITS,
  );

  const messageKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(messageKeyBits,) as Uint8Array<ArrayBuffer>,
    { name: "AES-GCM", length: MESSAGE_KEY_BITS, },
    false,
    ["encrypt", "decrypt",],
  );

  return {
    nextChainKey: new Uint8Array(nextChainBits,) as Uint8Array<ArrayBuffer>,
    messageKey,
    messageKeyBytes: new Uint8Array(messageKeyBits,) as Uint8Array<ArrayBuffer>,
  };
}

export async function decryptWithMessageKey(keyBytes: Uint8Array, payload: DhMessagePayload,): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(keyBytes,) as Uint8Array<ArrayBuffer>,
    { name: "AES-GCM", length: MESSAGE_KEY_BITS, },
    false,
    ["decrypt",],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(payload.nonce,) as Uint8Array<ArrayBuffer>, },
    key,
    fromBase64(payload.ciphertext,) as Uint8Array<ArrayBuffer>,
  );
  return new TextDecoder().decode(plaintext,);
}

export function canonicalJwk(jwk: JsonWebKey,): string {
  const src = jwk as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(src,).toSorted()) {
    sorted[k] = src[k];
  }

  const r = safeJsonStringify(sorted,);
  if (!r.ok) { throw new Error("canonicalJwk: serialize failed",); }
  return r.value;
}

export { fromBase64, toBase64, };
