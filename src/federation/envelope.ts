// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/envelope.ts — Sealed content envelopes for mesh pushes.
//
// Crypto programs against the `ContentCipher` seam (`./cipher`); the only
// implementation today is the shared mesh PSK. No plaintext on the wire.

import { createHash, } from "node:crypto";
import type { ContentCipher, } from "./cipher";

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
  cipher: ContentCipher;
},): Promise<ContentEnvelope> {
  const bytes = typeof input.content === "string"
    ? new TextEncoder().encode(input.content,)
    : input.content;
  const hash = createHash("sha256",).update(bytes,).digest("hex",);
  return {
    id: input.id,
    origin: input.origin,
    clock: input.clock ?? Date.now(),
    type: input.type ?? "blob",
    hash,
    size: bytes.length,
    ciphertext: await input.cipher.seal(bytes,),
  };
}

/**
 * Open an envelope: decrypt and verify the plaintext hash.
 * @param envelope
 * @param cipher
 * @throws On decrypt failure or hash mismatch.
 */
export async function openEnvelope(
  envelope: ContentEnvelope,
  cipher: ContentCipher,
): Promise<Uint8Array> {
  const bytes = await cipher.open(envelope.ciphertext,);
  const hash = createHash("sha256",).update(bytes,).digest("hex",);
  if (hash !== envelope.hash) {
    throw new Error(`content hash mismatch for ${envelope.id}`,);
  }
  if (bytes.length !== envelope.size) {
    throw new Error(`content size mismatch for ${envelope.id}`,);
  }
  return bytes;
}
