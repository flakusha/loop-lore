// src/config/schema/byo-key.ts — BYO API key config type

export interface ByoKeyConfig {
  /** Master toggle for user-owned API keys */
  enabled: boolean;
  /** Encryption key for stored API keys (falls back to auth.sessionSecret) */
  encryptionKey?: string;
}
