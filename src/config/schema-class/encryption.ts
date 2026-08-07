// src/config/schema-class/encryption.ts — encryption section defaults
import type { EncryptionConfig, } from "../schema";

export const ENCRYPTION_DEFAULTS = {
  required: false,
  compressThreshold: 128,
  compressAlgorithm: "gzip",
} satisfies EncryptionConfig;
