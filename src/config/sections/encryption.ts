// src/config/sections/encryption.ts — Encryption config section

import type { EncryptionConfig } from "../schema";

export const ENCRYPTION_DEFAULTS = {
  required: false,
  compressThreshold: 128,
  compressAlgorithm: "gzip" as const,
} satisfies EncryptionConfig;

export class EncryptionSection implements EncryptionConfig {
  required = ENCRYPTION_DEFAULTS.required;
  compressThreshold = ENCRYPTION_DEFAULTS.compressThreshold;
  compressAlgorithm = ENCRYPTION_DEFAULTS.compressAlgorithm;
  serverEncryptionKey?: string;

  constructor(overrides?: Partial<EncryptionConfig>) {
    Object.assign(this, overrides);
  }
}

export const encryptionMeta = {
  type: "object" as const,
  description: "Encryption / SMK configuration",
  properties: {
    serverEncryptionKey: {
      type: "string",
      description: "256-bit hex key. Missing = encryption disabled (dev mode).",
    },
    required: {
      type: "boolean",
      default: ENCRYPTION_DEFAULTS.required,
      description: "true = refuse to start without SMK (prod guard)",
    },
    compressThreshold: {
      type: "integer",
      default: ENCRYPTION_DEFAULTS.compressThreshold,
      description: "Min bytes before compressing prior to encrypt",
    },
    compressAlgorithm: {
      type: "string",
      default: ENCRYPTION_DEFAULTS.compressAlgorithm,
      description: "Preferred compression algorithm",
    },
  },
  required: ["required", "compressThreshold", "compressAlgorithm"] as const,
};
