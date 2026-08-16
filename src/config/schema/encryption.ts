// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/encryption.ts — Encryption / SMK config type

import type { EncryptionCompression, } from "../../db/enums";

export interface EncryptionConfig {
  /** 256-bit hex key from SERVER_ENCRYPTION_KEY env var. Missing = encryption disabled (dev mode). */
  serverEncryptionKey?: string;
  /** true = refuse to start without SMK (prod guard). Default false. */
  required: boolean;
  /** Min bytes before compressing prior to encrypt. Default 128. */
  compressThreshold: number;
  /** Preferred compression algorithm. Default gzip. */
  compressAlgorithm: EncryptionCompression;
  /** Days before auto-rotating actor keys. Default 0 (disabled). */
  keyRotationDays?: number;
  /** Enable anonymous chat mode. Actor identities hidden from other participants. Default false. */
  anonymous?: boolean;
}
