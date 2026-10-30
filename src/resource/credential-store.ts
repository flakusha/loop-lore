// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/resource/credential-store.ts — one-way credential references.
//
// The server never holds raw secrets: `store` returns a `sha256:` hex digest
// (or a wrapped-key envelope via src/crypto/byok.ts when a wrapping secret
// is supplied). `verify` re-hashes the candidate; `timingSafeEqual` avoids
// a naive `===` early-exit leak. See epic-resource-provision.md.

import { createHash, timingSafeEqual, } from "node:crypto";
import { decryptValue, encryptVersioned, } from "../crypto/byok";

/** Prefix for raw SHA-256 hex refs (no wrapping secret configured). */
const PLAIN_PREFIX = "sha256:";

/** Prefix for BYOK-wrapped refs: `wrapped:<version>:<envelope>`. */
const WRAPPED_PREFIX = "wrapped:";

/**
 * Hash a raw secret into a storable one-way reference. `wrapSecret` selects
 * the wrapped-envelope path (server-key wrapping via byok.ts); omit it for
 * the plain SHA-256 path.
 * @param secret - the raw credential (never persisted, never returned)
 * @param wrapSecret - optional server-side wrapping secret
 * @returns the storable reference
 */
export async function storeCredential(secret: string, wrapSecret?: string,): Promise<string> {
  if (!secret) { throw new Error("secret must be non-empty",); }
  if (wrapSecret !== undefined && wrapSecret === "") { throw new Error("wrapSecret must be non-empty",); }
  if (wrapSecret === undefined) {
    return `${PLAIN_PREFIX}${createHash("sha256",).update(secret, "utf8",).digest("hex",)}`;
  }

  return `${WRAPPED_PREFIX}${await encryptVersioned(secret, wrapSecret,)}`;
}

/**
 * Check a candidate secret against a stored reference without persisting it.
 * @param candidate - the secret to check
 * @param ref - the stored reference from {@link storeCredential}
 * @param wrapSecret - required when `ref` is a wrapped envelope
 * @returns true when the candidate matches
 */
export async function verifyCredential(candidate: string, ref: string, wrapSecret?: string,): Promise<boolean> {
  if (ref.startsWith(PLAIN_PREFIX,)) {
    const a = Buffer.from(ref.slice(PLAIN_PREFIX.length,), "hex",);
    const b = Buffer.from(createHash("sha256",).update(candidate, "utf8",).digest(),);
    return a.length === b.length && timingSafeEqual(a, b,);
  }

  if (!ref.startsWith(WRAPPED_PREFIX,)) { return false; }
  if (!candidate || wrapSecret === undefined) { return false; }
  try {
    const envelope = ref.slice(WRAPPED_PREFIX.length,);
    // The envelope seals the secret itself: decrypt, then compare in
    // constant time. decryptValue strips the `v<N>:` tag itself; a wrong
    // wrapSecret (or tampered envelope) throws — a mismatch, not an error.
    const sealed = await decryptValue(envelope, wrapSecret,);
    const a = Buffer.from(sealed, "utf8",);
    const b = Buffer.from(candidate, "utf8",);
    return a.length === b.length && timingSafeEqual(a, b,);
  } catch {
    return false;
  }
}

/**
 * Revoke a credential reference: the caller deletes the row holding `ref`
 * (this module holds no registry of its own, so there is nothing to purge
 * in-process). Returns the tombstone marker for audit rows.
 * @param ref - the reference being revoked
 * @returns the tombstone marker
 * @throws {Error} when `ref` is empty
 */
export function revokeCredential(ref: string,): string {
  if (!ref) { throw new Error("ref must be non-empty",); }
  return `revoked:${ref}`;
}
