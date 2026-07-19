// src/config/sections/byo-key.ts — BYO API Key config section

import type { ByoKeyConfig } from "../schema";

export const BYO_KEY_DEFAULTS = {
  enabled: true,
} satisfies ByoKeyConfig;

export class ByoKeySection implements ByoKeyConfig {
  enabled = BYO_KEY_DEFAULTS.enabled;
  encryptionKey?: string;

  constructor(overrides?: Partial<ByoKeyConfig>) {
    Object.assign(this, overrides);
  }
}

export const byoKeyMeta = {
  type: "object" as const,
  description: "BYO API Key configuration",
  properties: {
    enabled: {
      type: "boolean",
      default: BYO_KEY_DEFAULTS.enabled,
      description: "Enable user-owned API keys",
    },
    encryptionKey: {
      type: "string",
      description: "Encryption key for stored API keys",
    },
  },
  required: ["enabled"] as const,
};
