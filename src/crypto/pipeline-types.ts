// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 33

/** */
export interface EncryptedPayload {
  enc: string; // base64 ciphertext
  nonce: string; // base64 12-byte nonce
  algo: "aes-256-gcm";
  comp: boolean; // was compression applied before encrypt?
  compAlgo?: string; // which algorithm: gzip / brotli / zstd
  key_id: string; // FK → actor_keys.id
  a_id?: string; // asset id salt for HKDF-derived subkey (v2 only; absent = v1 legacy)
}

/** */
export interface PipelineConfig {
  threshold: number;
  algorithm: "gzip" | "brotli" | "zstd";
}

/** */
export interface CompressThenEncryptOpts {
  plaintext: string;
  chatKey: CryptoKey;
  keyId: string;
  config?: PipelineConfig;
  aId?: string; // asset id salt — emits v2 payload; absence = v1 legacy
}
