// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/envelope.ts — AES-256-GCM content envelopes for mesh pushes.
//
// Crypto reuses the existing `encryptValue` seam with an operator-supplied
// mesh PSK — no new primitives, no plaintext on the wire. Key distribution
// (per-peer wrapping) is follow-up work tied to the peer signing key store.

import { createHash, } from "node:crypto";
import { decryptValue, encryptValue, } from "../crypto/byok";

/** Wire envelope for one content push. */
export interface ContentEnvelope {
  /** Content id (stable across retries/duplicates). */
  id: string;
  /** Sending origin. */
  origin: string;
  /** Sender wall-clock ms (LWW ordering). */
  clock: number;
  /** Content type label. */
  type: string;
  /** SHA-256 hex of the plaintext. */
  hash: string;
  /** Plaintext byte length. */
  size: number;
  /** AES-GCM ciphertext over base64 plaintext. */
  ciphertext: string;
}

/**
 * Seal plaintext into a content envelope.
 * @param input
 */
export async function sealContent(input: {
  id: string;
  origin: string;
  clock?: number;
  type?: string;
  content: Uint8Array | string;
  secret: string;
},): Promise<ContentEnvelope> {
  const bytes = typeof input.content === "string"
    ? new TextEncoder().encode(input.content,)
    : input.content;
  const hash = createHash("sha256",).update(bytes,).digest("hex",);
  const base64 = Buffer.from(bytes,).toString("base64",);
  return {
    id: input.id,
    origin: input.origin,
    clock: input.clock ?? Date.now(),
    type: input.type ?? "blob",
    hash,
    size: bytes.length,
    ciphertext: await encryptValue(base64, input.secret,),
  };
}

/**
 * Open an envelope: decrypt and verify the plaintext hash.
 * @param envelope
 * @param secret
 * @throws On decrypt failure or hash mismatch.
 */
export async function openEnvelope(
  envelope: ContentEnvelope,
  secret: string,
): Promise<Uint8Array> {
  const base64 = await decryptValue(envelope.ciphertext, secret,);
  const bytes = Buffer.from(base64, "base64",);
  const hash = createHash("sha256",).update(bytes,).digest("hex",);
  if (hash !== envelope.hash) {
    throw new Error(`content hash mismatch for ${envelope.id}`,);
  }
  if (bytes.length !== envelope.size) {
    throw new Error(`content size mismatch for ${envelope.id}`,);
  }
  return bytes;
}
