// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/encryption.ts — MeshEncryptionProvider: one object encoding
// envelope cipher precedence so call sites stop hand-rolling selection.
//
// Precedence: an issued per-target content key (reserve response) first,
// mesh PSK fallback otherwise on the sender; inbound sender keys then PSK
// on the receiver. Future epic-level `EncryptionProvider` backends
// (Matrix/OMEMO/PGP) implement this interface without touching call sites.

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { type ContentCipher, pskCipher, } from "./cipher";
import { ciphersForSender, } from "./peer-keys";

/** Cipher selection for mesh content envelopes. */
export interface MeshEncryptionProvider {
  /** Mesh PSK cipher (probe seals, fallback path). */
  readonly psk: ContentCipher;
  /**
   * Cipher for an issued content key, or the PSK cipher when the reserve
   * response carried no key (no SMK or plaintext wire).
   * @param contentKey Base64 key from the reserve response, if any.
   */
  contentCipher(contentKey: string | undefined,): ContentCipher;
  /**
   * Ciphers that open one sender's envelopes, in try order: current
   * inbound key, grace previous, then PSK. PSK-only without an SMK.
   * @param database Receiver database handle (inbound key read).
   * @param senderOrigin Canonical sender origin.
   * @param smk Server master key for at-rest unwrapping (null = PSK-only).
   */
  receiverCiphers(
    database: Kysely<DB>,
    senderOrigin: string,
    smk: CryptoKey | null,
  ): Promise<ContentCipher[]>;
}

/**
 * Build the provider around one operator-distributed mesh PSK.
 * @param pskSecret Mesh PSK (env-only: MESH_PSK).
 */
export function createMeshEncryption(pskSecret: string,): MeshEncryptionProvider {
  const psk = pskCipher(pskSecret,);
  return {
    psk,
    contentCipher(contentKey: string | undefined,): ContentCipher {
      return contentKey !== undefined ? pskCipher(contentKey,) : psk;
    },
    receiverCiphers(
      database: Kysely<DB>,
      senderOrigin: string,
      smk: CryptoKey | null,
    ): Promise<ContentCipher[]> {
      return ciphersForSender(database, senderOrigin, psk, smk,);
    },
  };
}
