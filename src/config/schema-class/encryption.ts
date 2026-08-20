// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/encryption.ts — encryption section defaults
import type { EncryptionConfig, } from "../schema";

export const ENCRYPTION_DEFAULTS = {
  required: false,
  compressThreshold: 128,
  compressAlgorithm: "gzip",
  keyRotationDays: 90,
} satisfies EncryptionConfig;
