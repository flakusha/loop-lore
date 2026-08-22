// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E Key Pairs — ECDH P-256 generation + JWK import/export
 *
 * Generates EC P-256 key pairs on the client side. The private key NEVER leaves
 * the client; only the public key JWK is uploaded to the server via
 * `server-registry.ts`.
 *
 * Algorithm: ECDH-P256 (curve P-256 / secp256r1 / NIST P-256).
 * Rationale:
 *   - P-256 is widely supported by `crypto.subtle` on both browser (WebCrypto)
 *     and Node (WebCrypto global since Node 20+).
 *   - The protocol design (TASK-asymmetric-key-pairs.md) targets ECDH; the
 *     exact curve is intentionally a single-config knob (`algorithm` column in
 *     `actor_e2e_pubkeys`) so we can move to X25519 later without schema churn.
 *
 * Scope (v1 — this file):
 *   - generateKeyPair(): ECDH P-256 + extractable=true (exportable as JWK so
 *     it can be persisted to IndexedDB or downloaded as a backup).
 *   - exportPublicJwk / exportPrivateJwk
 *   - importKeyPair (JWK → CryptoKey, non-extractable for runtime use)
 *   - deriveSharedSecret (ECDH: derive AES-GCM session key from local priv +
 *     remote pub). This is also the first step of the session-key ratchet but
 *     kept here so the ratchet implementation in a later ticket can build on
 *     it without re-discovering the curve.
 *
 * Out of scope (v1):
 *   - Sender-key ratchet (per-message keys, forward secrecy): tracked in
 *     TASK-asymmetric-key-pairs-followup.md §"Key Open Questions" — needs
 *     design decision before implementation.
 *   - Key escrow / recovery: needs design decision.
 */

/** Default ECDH curve for v1. */
const NAMED_CURVE = "P-256" as const;

/** Length of the derived session-key AES-256-GCM key. */
const DERIVED_KEY_LENGTH = 256;

/** Context string bound into the HKDF — must be stable per Loop Lore version. */
const HKDF_INFO = "loop-lore-e2e-session-key-v1";

export interface KeyPairJwk {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export interface GenerateKeyPairOpts {
  /** If true, the private key is extractable (exportable as JWK for backup). Default: true. */
  extractable?: boolean;
}

/**
 * Generate a fresh ECDH P-256 key pair.
 *
 * Both keys are returned as `CryptoKey` handles. Use `exportPrivateJwk` /
 * `exportPublicJwk` to serialize for storage or upload.
 */
export async function generateKeyPair(opts: GenerateKeyPairOpts = {},): Promise<CryptoKeyPair> {
  const extractable = opts.extractable ?? true;
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: NAMED_CURVE, }, extractable, [
    "deriveKey",
    "deriveBits",
  ],);
}

/** Export a public ECDH key as a JWK (safe to upload to server). */
export async function exportPublicJwk(key: CryptoKey,): Promise<JsonWebKey> {
  // ECDH public keys are always exportable as JWK regardless of the
  // extractable flag — WebCrypto refuses only private export when non-extractable.
  return crypto.subtle.exportKey("jwk", key,);
}

/**
 * Export a private ECDH key as a JWK. Only allowed if the key was generated
 * with `extractable: true`. Throws otherwise.
 *
 * The exported JWK contains the raw private scalar; never upload it.
 */
export async function exportPrivateJwk(key: CryptoKey,): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key,);
}

/**
 * Import a public ECDH key from a JWK. Always non-extractable (only used for
 * ECDH derivation, never serialized further).
 */
export async function importPublicKey(jwk: JsonWebKey,): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: NAMED_CURVE, }, false, [],);
}

/**
 * Import a private ECDH key from a JWK. Marks the key extractable so it can be
 * re-exported for backup; pass `extractable: false` to lock it down after import.
 */
export async function importPrivateKey(jwk: JsonWebKey, opts: { extractable?: boolean } = {},): Promise<CryptoKey> {
  const extractable = opts.extractable ?? true;
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: NAMED_CURVE, }, extractable, [
    "deriveKey",
    "deriveBits",
  ],);
}

/**
 * Import a JWK key pair as runtime `CryptoKey` handles.
 *
 * The private key is marked non-extractable by default (forget-after-import
 * security). Set `extractablePrivate: true` only if you intend to re-export
 * (e.g. for backup).
 */
export async function importKeyPair(
  jwks: KeyPairJwk,
  opts: { extractablePrivate?: boolean } = {},
): Promise<CryptoKeyPair> {
  const publicKey = await importPublicKey(jwks.publicKey,);
  const privateKey = await importPrivateKey(jwks.privateKey, { extractable: opts.extractablePrivate ?? false, },);
  return { publicKey, privateKey, };
}

export interface DeriveSharedSecretOpts {
  /** The local actor's PRIVATE key. */
  privateKey: CryptoKey;
  /** The remote actor's PUBLIC key. */
  publicKey: CryptoKey;
}

/**
 * Derive a shared AES-256-GCM session key from an ECDH key agreement.
 *
 * Process:
 *   1. ECDH(localPriv, remotePub) → shared point (X coordinate as bytes).
 *   2. HKDF-SHA256(sharedBytes, salt=null, info=HKDF_INFO) → 32 bytes.
 *   3. Import as AES-GCM CryptoKey (extractable=false; encrypt/decrypt usage).
 *
 * Both sides compute the same key. The server never sees either side's
 * private key, so it cannot reconstruct the session key.
 *
 * Used by sender-key ratchet (future) and one-shot session keys (v1).
 */
export async function deriveSharedSecret(opts: DeriveSharedSecretOpts,): Promise<CryptoKey> {
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: opts.publicKey, }, opts.privateKey, 256,);
  const sharedBytes = new Uint8Array(sharedBits,);
  const ikm = toBufferSource(sharedBytes,);

  const sessionKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey",],);

  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32,), info: new TextEncoder().encode(HKDF_INFO,), },
    sessionKey,
    { name: "AES-GCM", length: DERIVED_KEY_LENGTH, },
    false, // session key is non-extractable — never leave this process
    ["encrypt", "decrypt",],
  );
}

/**
 * Variant of `deriveSharedSecret` that returns the raw 32-byte ECDH output
 * instead of an AES-GCM session key. Used as input keying material for the
 * symmetric ratchet (`nextRatchetStep`) — the chain key is bound into the
 * HKDF step, so the message key is per-chain-step.
 *
 * The ratchet module will accept this raw IKM directly via
 * `nextRatchetStep(rawBytes)`. Callers needing an AES-GCM session key for
 * generic purposes (not the ratchet) should use `deriveSharedSecret`.
 */
export async function deriveSharedBytes(opts: DeriveSharedSecretOpts,): Promise<Uint8Array> {
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: opts.publicKey, }, opts.privateKey, 256,);
  return new Uint8Array(sharedBits,);
}

// ── Internal helpers ───────────────────────────────────────

/** WebCrypto requires `BufferSource` for input; many lib versions don't accept `Uint8Array` directly. */
function toBufferSource(bytes: Uint8Array,): Uint8Array<ArrayBuffer> {
  // Slice into a fresh ArrayBuffer so the typed array satisfies BufferSource's
  // narrower type without sharing memory with the caller's buffer.
  const out = new Uint8Array(bytes.byteLength,);
  out.set(bytes,);
  return out as Uint8Array<ArrayBuffer>;
}
