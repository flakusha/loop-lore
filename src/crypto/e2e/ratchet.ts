// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Symmetric-Key Ratchet (TASK-asymmetric-key-pairs-followup — Phase A)
 *
 * Each call advances the chain key by one HKDF step and emits a fresh
 * message key. The chain key is the only state needed to derive the next
 * message key; the message key is what encrypts one message.
 *
 *   chainKey₀  ──next──▶  { chainKey₁, messageKey₀ }
 *   chainKey₁  ──next──▶  { chainKey₂, messageKey₁ }
 *   ...
 *
 * Properties:
 *   - Forward secrecy (one-message window): knowing `chainKeyₙ` does not
 *     reveal `messageKeyₙ₋₁` because the message key is derived via HKDF
 *     and the chain key step discards its input. Combined with ECDH
 *     rotation at the session root (every Nth message), a sender-key
 *     compromise leaks only the future window.
 *   - Stateless: no DB or external state. The chain key is the entire
 *     ratchet state; it lives only on the client.
 *
 * Scope (Phase A — single-message ratchet):
 *   - The chain key is bootstrapped from the ECDH-derived session key
 *     (`deriveSharedSecret` in `./key-pairs.ts`).
 *   - The chain key is persisted by the **client**, not by the server.
 *   - Each message uses one chain step; the chain key is advanced after
 *     each successful send/receive.
 *
 * Out of scope (Phase B):
 *   - Multi-message chain advancement driven by `chain_index`.
 *   - Out-of-order handling (skipped-message back-fill).
 *   - Sender-key ratchet (the chain re-root step is Phase C).
 *
 * Algorithm:
 *   - HKDF-SHA256 with `info` binding the chain key to the role
 *     ("loop-lore-e2e-chain-key-v1"). The role string prevents a chain
 *     key from being valid for any other purpose in the same client.
 *   - 32-byte (256-bit) message keys — direct AES-256-GCM.
 */

const CHAIN_KEY_INFO = "loop-lore-e2e-chain-key-v1" as const;
const MESSAGE_KEY_INFO = "loop-lore-e2e-message-key-v1" as const;
const KEY_LENGTH = 32;

export interface RatchetStep {
  /** Updated chain key. Pass to the next `nextRatchetStep` call. */
  chainKey: Uint8Array;
  /** One-shot message key. Use with AES-256-GCM; never reuse. */
  messageKey: Uint8Array;
}

/**
 * Advance the chain key by one step and derive the next message key.
 *
 * @param chainKey - Current chain key bytes (typically the AES-GCM session
 *   key from `deriveSharedSecret`, or the previous step's `chainKey`).
 *   Treated as input keying material; discarded after the call.
 * @returns The updated `chainKey` (pass back into the next call) and a fresh
 *   `messageKey` for one AES-256-GCM encryption.
 */
export async function nextRatchetStep(chainKey: Uint8Array,): Promise<RatchetStep> {
  if (chainKey.byteLength !== KEY_LENGTH) {
    throw new Error(`chain key must be ${KEY_LENGTH} bytes (got ${chainKey.byteLength})`,);
  }

  const baseKey = await importHmacKey(chainKey,);
  const chainKeyOut = new Uint8Array(KEY_LENGTH,);
  const messageKey = new Uint8Array(KEY_LENGTH,);

  // Derive the two outputs in parallel via HKDF-Expand with two distinct info strings.
  await Promise.all([
    hkdfExpand(baseKey, MESSAGE_KEY_INFO, messageKey,),
    hkdfExpand(baseKey, CHAIN_KEY_INFO, chainKeyOut,),
  ],);

  // Defense in depth: zeroize the input key material. HKDF outputs are
  // fresh material; the input chain key is no longer needed after this call.
  chainKey.fill(0,);

  return { chainKey: chainKeyOut, messageKey, };
}

/** Import raw bytes as an HKDF base key (extract step is a no-op). */
async function importHmacKey(rawKey: Uint8Array,): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toBufferSource(rawKey,),
    { name: "HKDF", },
    false,
    ["deriveBits",],
  );
}

/** HKDF-Expand (RFC 5869): derive `out` bytes from `baseKey` + `info`. */
async function hkdfExpand(baseKey: CryptoKey, info: string, out: Uint8Array,): Promise<void> {
  const bits = out.byteLength * 8;
  const derived = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0,), // no salt — extract step is the identity for known IKM
      info: new TextEncoder().encode(info,),
    },
    baseKey,
    bits,
  );
  out.set(new Uint8Array(derived,),);
}

/** WebCrypto wants `BufferSource`; typed-array views are accepted but the type
 *  signature varies by @types/web. Narrowing via fresh ArrayBuffer copy is the
 *  portable approach used across this module. */
function toBufferSource(bytes: Uint8Array,): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength,);
  copy.set(bytes,);
  return copy as Uint8Array<ArrayBuffer>;
}
