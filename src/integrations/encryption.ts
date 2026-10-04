// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/encryption.ts — E2EE provider seam (spec §2.3).
//
// Concrete providers live in their owning sub-epics: MatrixEncryption
// (Olm/Megolm), OmemoEncryption (XMPP), PgpEncryption (email). This is NOT
// the mesh seam — that is MeshEncryptionProvider in src/federation/encryption.ts.

import type { AdapterMessage, } from "./adapter";

/** Ciphertext envelope; routing fields ride `envelope` untouched. */
export interface EncryptedMessage {
  /** Provider scheme id (e.g. "passthrough", "pgp", "olm"). */
  readonly algorithm: string;
  /** Opaque encrypted body. */
  readonly ciphertext: string;
  /** Routing envelope preserved from the plaintext message. */
  readonly envelope: Omit<AdapterMessage, "body">;
}

/** Key material reported by a provider's `generateKeys`. */
export interface KeyPair {
  /** Scheme id the keypair belongs to (e.g. "pgp"). */
  readonly algorithm: string;
  /** Public half — always safe to persist and distribute. */
  readonly publicKey: string;
  /** Private half — present only when custody sits with the host (spec §7). */
  readonly privateKey?: string;
}

/**
 * End-to-end encryption seam every provider (Matrix/Olm, XMPP/OMEMO,
 * email/PGP) implements; key material comes from epic-crypto.
 */
export interface EncryptionProvider {
  /** Encrypt a plaintext message for transport. */
  encrypt(message: AdapterMessage,): Promise<EncryptedMessage>;
  /** Decrypt back to the plaintext message. */
  decrypt(message: EncryptedMessage,): Promise<AdapterMessage>;
  /** Generate a fresh keypair for this provider's scheme. */
  generateKeys(): Promise<KeyPair>;
}

/** Algorithm tag of {@link createPassthroughEncryptionProvider}. */
export const PASSTHROUGH_ALGORITHM = "passthrough";

/**
 * No-op provider for plaintext transports (bot APIs, spec §7 table).
 * Round-trips the body unchanged and yields an empty (keyless) keypair.
 * @returns The passthrough provider.
 */
export function createPassthroughEncryptionProvider(): EncryptionProvider {
  return {
    async encrypt(message,) {
      const { body, ...envelope } = message;
      return { algorithm: PASSTHROUGH_ALGORITHM, ciphertext: body, envelope, };
    },
    async decrypt(message,) {
      return { ...message.envelope, body: message.ciphertext, };
    },
    async generateKeys() {
      return { algorithm: PASSTHROUGH_ALGORITHM, publicKey: "", };
    },
  };
}
